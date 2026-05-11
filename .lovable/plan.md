## Diagnóstico do fluxo atual

Investiguei o fluxo completo (Kanban → arrematados → Pré-Contrato → Consolidação) e encontrei **1 bug crítico** que causa **duplicação de contratos** ao consolidar.

### Como o fluxo deveria funcionar

```text
Licitação → arrematados (Kanban)
    │
    ├── Trigger SQL cria automaticamente:
    │     • contrato_rascunho (status='rascunho')
    │     • contratos (status_contrato='Pre-Contrato', cliente_id=NULL, codigo_interno=N)
    │     • copia anexos das 3 origens (tabela + 2 buckets) para ambos
    │
    └── Usuário abre rascunho → "Consolidar Contrato"
          → preenche cliente/datas no ContratoDialogWithClient
          → cria contrato Ativo (cliente_id preenchido)
          → marca rascunho consolidado
          → transfere codigo_interno do Pré-Contrato para o Ativo
          → DELETA o Pré-Contrato órfão
```

### Bug identificado: Pré-Contrato fica órfão após consolidar

**Sintoma real (banco):** licitação `7425614` tem Contrato Ativo `#99` consolidado **e** Pré-Contrato `#98` ainda existindo (mesma `licitacao_origem_id`). Vai acontecer também com `#96` e `#100` na próxima consolidação.

**Causa:** em `ContratoDialogWithClient.tsx` (linhas 1161-1180), a remoção do Pré-Contrato só ocorre se `rascunho.contrato_id` apontar para ele. Mas:

- O trigger `create_captacao_card_on_licitacao_arrematada` **não** preenche `contrato_rascunho.contrato_id` com o ID do Pré-Contrato criado.
- Logo, no momento da consolidação, `rascunho.contrato_id` é `NULL` → o lookup falha → o Pré-Contrato antigo (`#98`) fica para sempre, e o novo Ativo (`#99`) recebe um codigo_interno novo em vez de herdar o `#98`.

### Outros pontos verificados (OK)

- Cópia de anexos das 3 origens (`licitacoes_anexos`, bucket `licitacoes-anexos`, bucket `editais-pdfs`) está consistente em trigger, helpers de hook, Kanban e re-sincronização do dialog.
- `consolidarMutation` em `useContratoRascunho.ts` é código morto no fluxo atual (sempre passa pelo `ContratoDialogWithClient` via `onAvancarParaContrato`). Funciona como fallback, mas tem o mesmo problema (cria contrato novo sem deletar Pré-Contrato).
- Cancelamento do rascunho já remove Pré-Contrato órfão corretamente.
- Trigger de revogação (`cleanup_pre_contrato_on_licitacao_revogada`) está correto.

---

## Plano de correção

### 1. Migration SQL — vincular Pré-Contrato ao rascunho na criação

Atualizar a função `create_captacao_card_on_licitacao_arrematada` para, após criar (ou reaproveitar) o Pré-Contrato e o rascunho, executar:

```sql
UPDATE public.contrato_rascunho
SET contrato_id = v_pre_contrato_id
WHERE id = v_rascunho_id
  AND (contrato_id IS NULL OR contrato_id = v_pre_contrato_id);
```

Isso garante que toda nova arrematação já deixa o rascunho apontando para o Pré-Contrato órfão correto.

### 2. Migration SQL — backfill dos rascunhos existentes

Para os 3 casos já no banco (rascunhos `bf4c6f65`, `758ff913` e similares), preencher `contrato_rascunho.contrato_id` com o Pré-Contrato existente:

```sql
UPDATE public.contrato_rascunho cr
SET contrato_id = c.id
FROM public.contratos c
WHERE cr.status = 'rascunho'
  AND cr.contrato_id IS NULL
  AND c.licitacao_origem_id = cr.licitacao_id
  AND c.status_contrato = 'Pre-Contrato'
  AND c.cliente_id IS NULL;
```

E, para limpar a duplicata existente da licitação `7425614` (Pré-Contrato `#98` órfão paralelo ao Ativo `#99`), transferir `codigo_interno` e deletar o órfão se confirmado pelo usuário.

### 3. Frontend — fortalecer o lookup do Pré-Contrato na consolidação

Em `ContratoDialogWithClient.tsx` (linha ~1161), além de usar `rascunho.contrato_id`, fazer fallback adicional:

```ts
let preContratoId = rascunho?.contrato_id;
if (!preContratoId && rascunho?.licitacao_id) {
  const { data: pc } = await supabase
    .from('contratos')
    .select('id, codigo_interno')
    .eq('licitacao_origem_id', rascunho.licitacao_id)
    .eq('status_contrato', 'Pre-Contrato')
    .is('cliente_id', null)
    .maybeSingle();
  if (pc) preContratoId = pc.id;
}
```

E garantir que, se `preContratoId !== result.contratoId`, o codigo_interno é transferido **antes** do delete (já está) e o delete é executado.

### 4. Frontend — aplicar o mesmo lookup em `useContratoRascunho.consolidarMutation`

Para que o fallback funcione mesmo se o fluxo alternativo (sem `onAvancarParaContrato`) for usado.

### 5. Verificação

- Rodar query confirmando que todos os rascunhos `status='rascunho'` têm `contrato_id` preenchido.
- Testar arrematação nova → consolidar → conferir que sobra apenas 1 contrato (Ativo), com `codigo_interno` herdado do Pré-Contrato.
- Conferir contagem de anexos preservada após consolidação.

### Resumo

Com 2 ajustes pequenos (1 trigger + 1 fallback no frontend) e 1 backfill, o fluxo Pré-Contrato → Consolidação fica determinístico, sem duplicatas e preservando o `codigo_interno` original.
