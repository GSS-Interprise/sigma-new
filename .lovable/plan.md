

# Estratégia Robusta para Leads no Acompanhamento pós-Disparo

## Problemas identificados

1. **Lead já no corpo clínico** — se alguém dispara para um médico que já é corpo clínico (status "Convertido"), mudar status para "Acompanhamento" APAGA o histórico de conversão
2. **Lead na blacklist** — disparos manuais podem atingir leads bloqueados sem aviso
3. **Múltiplas propostas** — o lead pode ter 2+ propostas (já existem 5 leads com múltiplas propostas no banco), mas o sistema precisa garantir que uma nova proposta não substitui a anterior
4. **Dados do lead** — ao mover status, dados pessoais/contratuais não podem ser perdidos

## Regras de negócio propostas

### Regra 1: Verificar blacklist ANTES de adicionar à campanha
No `disparos-webhook`, ao inserir contatos, cruzar com a tabela `blacklist`. Contatos na blacklist são rejeitados com status `"7-BLACKLIST"` (novo status) e logados. O webhook retorna quantos foram bloqueados.

### Regra 2: Não rebaixar status de leads avançados
Ao confirmar envio (`4-ENVIADO`), a lógica de mover para "Acompanhamento" só executa se o status atual do lead for **"Novo"**. Se o lead já estiver em qualquer outro status (Convertido, Qualificado, Acompanhamento, etc.), o status **não muda**. O lead apenas recebe um registro no `lead_historico` dizendo "Novo disparo realizado".

### Regra 3: Lead do corpo clínico — vincular sem alterar status
Se o lead já tem um `medico` vinculado (`medicos.lead_id`), ele NÃO sai do corpo clínico. O disparo é registrado no histórico do lead, e uma flag `ultimo_disparo_em` é atualizada no lead para rastreio, mas o status permanece "Convertido".

### Regra 4: Múltiplas propostas
A tabela `proposta` já suporta múltiplas propostas por lead (já existem leads com 2 propostas). Cada proposta tem seu próprio `contrato_id`, `unidade_id`, `servico_id`. Nenhuma lógica substitui proposta anterior — sempre INSERT, nunca UPDATE de proposta existente. Adicionaremos um campo `numero_proposta` auto-incrementado por lead para identificação clara (Proposta 1, Proposta 2...).

## Mudanças técnicas

### 1. Migration SQL
- Adicionar coluna `ultimo_disparo_em` (timestamptz) na tabela `leads`
- Adicionar coluna `numero_proposta` (integer) na tabela `proposta`

### 2. `disparos-webhook/index.ts` — ao inserir contatos (linhas 106-167)
```text
Para cada contato:
  1. Verificar blacklist por phone_e164
     → Se na blacklist: marcar status "7-BLACKLIST", não inserir na campanha
  2. Se lead_id não veio no payload:
     → find_lead_by_phone(telefone_e164) → setar lead_id
  3. Se lead encontrado:
     → Se status == "Novo" → mudar para "Acompanhamento"
     → Se qualquer outro status → NÃO mudar, apenas logar no lead_historico
     → Atualizar leads.ultimo_disparo_em = now()
```

### 3. `disparos-callback/index.ts` — fallback no status 4-ENVIADO (linhas 78-107)
```text
Se lead_id null no contato:
  → find_lead_by_phone(telefone_e164)
  → Se encontrou, atualizar lead_id no contato
Se lead encontrado:
  → Mesmo check: só muda para "Acompanhamento" se status atual == "Novo"
  → Registrar no lead_historico "Disparo confirmado como enviado"
```

### 4. `NovaPropostaDialog.tsx` / `VincularPropostaExistenteDialog.tsx`
- Ao criar proposta, calcular `numero_proposta` = max(numero_proposta) do lead + 1
- Exibir no UI "Proposta #1", "Proposta #2" etc.

### 5. Frontend — aviso visual no painel de contatos
- Na `DisparosImportDialog` e `DisparosContatosPanel`, mostrar badge "BLACKLIST" para contatos bloqueados
- Na `DisparosImportDialog`, filtrar contatos da blacklist com aviso: "X contatos removidos por estarem na blacklist"

## Fluxo resumido

```text
Contato adicionado à campanha
  ├─ Na blacklist? → Status "7-BLACKLIST", não envia, avisa o captor
  ├─ Lead encontrado com status "Novo"? → Muda para "Acompanhamento"
  ├─ Lead já "Convertido" (corpo clínico)? → NÃO muda status, registra histórico
  ├─ Lead já em outro status? → NÃO muda status, registra histórico
  └─ Sempre: atualiza ultimo_disparo_em no lead

Proposta criada
  └─ Sempre INSERT (nunca substitui)
  └─ numero_proposta auto-incrementa por lead
  └─ Cada proposta pode ter contrato/unidade/serviço diferentes
```

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | `ultimo_disparo_em` em leads, `numero_proposta` em proposta |
| `disparos-webhook/index.ts` | Check blacklist + vinculação de lead + regras de status |
| `disparos-callback/index.ts` | Fallback lookup + regras de status (não rebaixar) |
| `NovaPropostaDialog.tsx` | Auto-numerar proposta |
| `VincularPropostaExistenteDialog.tsx` | Auto-numerar proposta |
| `LeadPropostasSection.tsx` | Exibir "Proposta #N" |
| `DisparosImportDialog.tsx` | Filtro de blacklist com aviso |
| `DisparosContatosPanel.tsx` | Badge "BLACKLIST" no status |

