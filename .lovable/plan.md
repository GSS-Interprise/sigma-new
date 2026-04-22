

## Objetivo

Quando o operador enviar a primeira mensagem manual ao lead (botão "Enviar" do painel manual OU input do chat SIG Zap), o lead deve:

1. Ficar marcado como **Contactado** na lista da proposta (já funciona pelo botão "Enviar"; falta para o input do chat).
2. Aparecer automaticamente no **Kanban de Acompanhamento** (`/disparos/acompanhamento`) na coluna "Contatados".

Hoje:
- Botão "Enviar" do painel manual → grava `disparo_manual_envios`, fecha raia WhatsApp como `respondeu` (vira `contactado` na view) → **mas o lead NÃO entra no Kanban de Acompanhamento**, porque o Kanban lê `leads.status` (texto livre tipo "Contatados", "Enviados", etc.), não a view de propostas.
- Input do chat SIG Zap → só insere mensagem; nada é feito na proposta nem no `leads.status`.

## O que vai mudar

### 1. Trigger de banco em `sigzap_messages`

Quando uma mensagem `from_me = true` for inserida em uma conversa com `lead_id`:

- Para cada `campanha_proposta` ativa onde esse lead aparece: chama `fechar_lead_canal(..., 'whatsapp', 'respondeu', 'Mensagem enviada via SIG Zap')` se ainda houver raia WhatsApp aberta. Isso garante que o status na proposta vire **Contactado** mesmo quando enviado pelo input do chat.
- Atualiza `leads.status` para a label da **primeira coluna** do Kanban de Acompanhamento (`disparos`) — hoje "Contatados" — somente se o status atual for `Novo` ou vazio (não sobrescreve operadores que já moveram o card adiante).
- Insere registro em `lead_historico` com `tipo_evento = 'mensagem_manual_enviada'`.

A trigger é idempotente: só dispara na **primeira** mensagem outbound por conversa (verifica `NOT EXISTS` de outra `from_me=true` anterior na mesma `conversation_id`).

### 2. Painel manual (`send-disparo-manual`)

Adicionar a mesma atualização de `leads.status → "Contatados"` ao final da função (caso o lead ainda esteja como `Novo`). Hoje a função fecha a raia mas não promove o lead ao Kanban de Acompanhamento.

### 3. Frontend — invalidar Kanban Acompanhamento

Em `useDisparoManual.ts` (botão Enviar) e no hook de envio do chat SIG Zap, invalidar `["acompanhamento-leads"]` no `onSuccess` para o card aparecer imediatamente.

### 4. Backfill (uma vez)

Migration roda um update único: para cada conversa com `from_me=true` cujo lead esteja com `status='Novo'`, promove para "Contatados" e fecha a raia das propostas ativas correspondentes. Assim os leads "Ewerton rubi" e "Bruna Pereira" que você já contactou aparecem corretos.

## Detalhes técnicos

**Migration SQL (resumo):**

```sql
-- 1) Função do trigger
CREATE OR REPLACE FUNCTION trg_sigzap_outbound_marca_contactado() ...
  -- só atua se NEW.from_me = true E é a primeira from_me da conversa
  -- busca conv.lead_id; se null, sai
  -- fecha raia whatsapp em todas campanha_propostas ativas com esse lead
  -- UPDATE leads SET status='Contatados' WHERE id=lead_id AND status IN ('Novo', NULL)
  -- INSERT lead_historico

CREATE TRIGGER trg_sigzap_outbound_after_insert
AFTER INSERT ON sigzap_messages
FOR EACH ROW WHEN (NEW.from_me = true)
EXECUTE FUNCTION trg_sigzap_outbound_marca_contactado();

-- 2) Backfill
DO $$ ... promove leads existentes ... $$;
```

**Arquivos alterados:**
- nova migration SQL (trigger + backfill)
- `supabase/functions/send-disparo-manual/index.ts` — promover `leads.status`
- `src/hooks/useDisparoManual.ts` — invalidar `acompanhamento-leads`
- hook de envio do chat SIG Zap (provavelmente `ChatView.tsx` `sendMutation`) — invalidar `acompanhamento-leads` e `lead-status-proposta`

## Resultado esperado

Ao enviar a primeira mensagem manual:
- Lead aparece como **Contactado** na proposta (badge verde).
- Card do lead aparece na coluna **Contatados** do Kanban `/disparos/acompanhamento`.
- Operador pode arrastar livremente daí em diante (Sem Resposta, Respondidos, etc.) sem que mensagens futuras sobrescrevam.

