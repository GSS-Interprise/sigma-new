

## Sincronizar disparo manual ↔ disparo em massa (Zap)

Hoje os dois fluxos não conversam: o n8n pode buscar um lead que já foi contactado manualmente, e um envio manual não é refletido na fila de massa. A view `vw_lead_status_por_proposta` cobre parcialmente, mas a tabela `disparos_contatos` (fila do n8n) não é atualizada nos dois sentidos.

### O que vamos garantir

1. **Manual → Massa**: ao enviar manual com sucesso, qualquer `disparos_contatos` pendente daquele lead/proposta vira `4-ENVIADO` (não vai mais para o n8n).
2. **Massa "tratando" → Manual**: leads com `disparos_contatos.status = '3-TRATANDO'` ou `'4-ENVIADO'` aparecem como **contactado** na lista "a contactar" do manual (já tem fallback parcial via `disparo_manual_envios` e `sigzap_messages`, falta cobrir o caso em que o n8n pegou mas ainda não voltou callback).
3. **Idempotência**: `gerar_disparo_zap` já ignora leads com status pendente. Sem mudança.

### Mudanças

**A. Edge `send-disparo-manual`** (após `disparo_manual_envios` insert com `status='enviado'`):
```ts
await supabase.from('disparos_contatos')
  .update({ status: '4-ENVIADO', updated_at: nowIso })
  .eq('campanha_proposta_id', campanha_proposta_id)
  .eq('lead_id', lead_id)
  .in('status', ['1-ENVIAR','2-REENVIAR','3-TRATANDO']);
```
Marca como enviado para tirar da fila do n8n. Adiciona evento `lead_historico` com tag `origem: 'manual'` (já existe, só completar metadados).

**B. Hook `useLeadsAContactar.ts`**: incluir uma quarta fonte de "contactado":
- Buscar `disparos_contatos` da proposta com status em `('3-TRATANDO','4-ENVIADO')` para os `leadIds` e mesclar no `contactMap` (timestamp = `updated_at`).

Isso resolve o cenário "n8n já pegou os 120, ainda não enviou callback" — esses leads não aparecem mais como "a contactar" no painel manual.

**C. View `vw_lead_status_por_proposta` (opcional, recomendado)**: garantir que considera `disparos_contatos.status IN ('3-TRATANDO','4-ENVIADO')` como `contactado`. Vou inspecionar a definição atual; se já cobre, não mexo. Se não, migration ajusta para que toda a UI (Kanban, status, etc.) fique consistente.

**D. Callback `disparos-callback` (status `4-ENVIADO`)**: já marca em `lead_raia_status`/`lead_historico`. Adicionar registro espelho em `disparo_manual_envios`? **Não** — manteremos `disparo_manual_envios` exclusivo do manual; a fonte cruzada será `disparos_contatos` lida pelo hook.

### Fluxo final

```text
Manual envia ──┐
               ├──► disparo_manual_envios (insert)
               ├──► disparos_contatos UPDATE → 4-ENVIADO   (NOVO)
               └──► sigzap_messages

n8n GET ──────► disparos_contatos UPDATE → 3-TRATANDO
n8n callback ─► disparos_contatos UPDATE → 4-ENVIADO
                    │
                    └──► useLeadsAContactar lê 3-TRATANDO + 4-ENVIADO
                         e marca lead como "contactado"  (NOVO)
```

### Arquivos editados

- `supabase/functions/send-disparo-manual/index.ts` — update em `disparos_contatos` após sucesso.
- `src/hooks/useLeadsAContactar.ts` — adicionar leitura de `disparos_contatos` ao `contactMap`.
- (Condicional) Migration ajustando `vw_lead_status_por_proposta` se a definição atual ignorar `3-TRATANDO`.

Sem novas tabelas, sem novas colunas. Apenas sincronização entre o que já existe.

