

## Ajuste ao plano: incluir disparo em massa

Adiciono o **disparo em massa** (campanhas automáticas) à mesma regra: qualquer mensagem enviada vinculada a um lead conta como contactado e abre a raia.

## Regra única de "Contactado"

Toda mensagem outbound (`from_me=true`) inserida em `sigzap_messages` cuja conversa tenha `lead_id` vinculado dispara o mesmo fluxo, independente da origem:

| Origem | Como vincula o lead à conversa |
|---|---|
| Painel manual (`send-disparo-manual`) | Já faz upsert em `sigzap_conversations` com `lead_id` antes de enviar |
| Input do chat SIG Zap | Conversa já existe com `lead_id` (ou ficará null e a trigger ignora) |
| Disparo em massa (`campanha-disparo-processor`) | **NOVO**: precisa criar/atualizar `sigzap_conversations` com `lead_id` antes/depois do envio para a trigger funcionar |

## O que muda

### 1. Trigger única em `sigzap_messages` (cobre as 3 origens)

`AFTER INSERT WHEN from_me=true`:
- Se `conv.lead_id IS NULL` → sai (sem vínculo, sem ação).
- Se já existe outra mensagem `from_me=true` anterior na mesma `conversation_id` → sai (idempotente).
- Para cada `campanha_proposta` ativa contendo o lead, se NÃO existe raia WhatsApp aberta:
  - INSERT em `campanha_proposta_lead_canais` com `entrou_em=now()`, `status_final=NULL` → lead vira "Contactado" e cronômetro inicia.
- `UPDATE leads SET status='Contatados'` se status atual `IN ('Novo', NULL)` → aparece no Kanban Acompanhamento.
- INSERT em `lead_historico` (`tipo_evento='mensagem_enviada'`, metadados com origem inferida do contexto da conversa).

### 2. `campanha-disparo-processor` (disparo em massa)

Hoje envia direto pela Evolution API e atualiza counters da campanha, **mas não persiste em `sigzap_conversations` / `sigzap_messages`**. Ajuste:

- Antes/depois de cada envio bem-sucedido, fazer upsert de:
  - `sigzap_contacts` (instance + jid)
  - `sigzap_conversations` com `lead_id = lead.id`
  - `sigzap_messages` com `from_me=true`, `wa_message_id` retornado pela Evolution
- A trigger automaticamente fecha a raia "a contactar" e move pro Kanban Acompanhamento.

Vantagem extra: o lead disparado em massa passa a ter conversa visível no SIG Zap, podendo ser respondido pelo operador.

### 3. Painel manual (`send-disparo-manual`)

Remover a chamada `fechar_lead_canal(... 'respondeu')` do final. Quem fecha/abre raia agora é a trigger (apenas abre, não fecha — fechar é decisão do operador via "Encerrar"/"Próxima fase" do plano anterior).

### 4. Frontend — invalidações

- `useDisparoManual` e hook do chat SIG Zap: invalidar `["acompanhamento-leads"]`, `["lead-status-proposta"]`, `["lead-canais"]`, `["leads-a-contactar"]`.

### 5. Backfill (uma vez)

Para toda `sigzap_conversations` com `lead_id IS NOT NULL` que tenha mensagem `from_me=true`:
- Se lead em proposta ativa sem raia WhatsApp aberta → criar raia aberta com `entrou_em = timestamp da primeira outbound`.
- Promover `leads.status='Contatados'` se ainda `Novo`.

## Combina com plano anterior dos 2 botões

Esse fluxo apenas **abre** a raia. O fechamento continua sendo decisão manual:
- **Encerrar** → fecha como `encerrado`.
- **Próxima fase** → fecha como `transferido` e abre raia do próximo canal.

## Arquivos alterados

- nova migration SQL: trigger `trg_sigzap_outbound_after_insert` + RPC `enviar_lead_proxima_fase` + backfill
- `supabase/functions/send-disparo-manual/index.ts` — remover fechamento de raia
- `supabase/functions/campanha-disparo-processor/index.ts` — persistir conversa/mensagem após envio
- `src/components/disparos/CampanhaLeadsList.tsx` — coluna tempo ao vivo + botões "Encerrar" e "Próxima fase"
- `src/components/disparos/TempoRaia.tsx` (novo) — cronômetro
- `src/hooks/useLeadCanais.ts` — `useEnviarProximaFase`
- `src/hooks/useDisparoManual.ts` + hook do chat SIG Zap — invalidações

## Resultado

Qualquer mensagem enviada vinculada a um lead (manual, chat ou massa) → lead vira "Contactado", aparece no Kanban Acompanhamento, cronômetro de raia inicia, operador decide depois entre Encerrar ou Próxima fase.

