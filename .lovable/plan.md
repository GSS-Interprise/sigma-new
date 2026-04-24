# Automação de status no Kanban de Acompanhamento

Automatizar as 3 primeiras colunas do Kanban (`/disparos/acompanhamento`) com base no comportamento real do lead, respeitando qualquer movimentação manual.

## Colunas envolvidas (existentes em `kanban_status_config`)

- `Acompanhamento` — "Contatados" (disparo enviado, aguardando)
- `sem_resposta` — "Sem Resposta" (>24h sem resposta ao disparo)
- `em_conversa` — "Conversação" (lead ou operador conversando)

As demais colunas (`qualificados`, `Aprovados`, `descartados`, `Devolucao_Contratos`) e o envio para Kanban Médico ficam **fora da automação**.

## Regras de negócio

1. **Disparo enviado (manual ou em massa)** → lead vai para `Acompanhamento` automaticamente (já ocorre hoje via `disparos-callback` / `disparos-webhook`, mas hoje só promove quem está em `Novo`). Vamos ampliar: se o lead estiver em `sem_resposta` e receber um **novo disparo** (ex.: próxima raia do fluxo — e-mail, Instagram, etc.), ele volta para `Acompanhamento`.

2. **>24h sem resposta ao disparo** → se status = `Acompanhamento` e não houve **nenhuma mensagem recebida do lead** desde o disparo há mais de 24h → move para `sem_resposta`.

3. **Lead respondeu / alguém está conversando** → se chega mensagem do lead (`from_me = false`) **ou** o operador envia mensagem manual (`from_me = true` fora de um disparo de campanha) e o status atual é `Acompanhamento` ou `sem_resposta` → move para `em_conversa`.

4. **Conversa parou mas já estava em `em_conversa`** → permanece em `em_conversa`. Nunca volta para `sem_resposta` (só é "sem resposta" se nunca respondeu ao disparo).

5. **Movimentação manual trava a automação naquele momento**: se o usuário arrastar o card para qualquer coluna (inclusive entre as 3), a automação **não sobrescreve** enquanto a raia não mudar. Destrava assim que o lead entra em uma nova raia (`campanha_proposta_lead_canais` ganha um novo `entrou_em`) ou recebe novo disparo.

6. **Saídas da automação**: se o lead foi movido para `qualificados`, `Aprovados`, `descartados`, `Devolucao_Contratos`, ou enviado ao Kanban Médico → automação não atua mais nele.

## Desenho técnico

### 1. Tabela de controle de automação

Criar `lead_automacao_raia`:

```
lead_id uuid PK → leads.id
ultimo_disparo_em timestamptz      -- quando foi o último disparo registrado
ultima_resposta_em timestamptz     -- última msg recebida do lead
ultima_msg_operador_em timestamptz -- última msg from_me fora de campanha
movido_manualmente_em timestamptz  -- timestamp da última mudança manual
raia_atual text                    -- canal ativo (whatsapp/email/...)
raia_entrou_em timestamptz         -- quando entrou na raia atual
automacao_travada boolean          -- true após movimentação manual, false após nova raia/disparo
updated_at timestamptz
```

### 2. Triggers no Postgres

- **Em `sigzap_messages` (AFTER INSERT)**:
  - Se `from_me = false` → atualiza `ultima_resposta_em` e, se status ∈ (`Acompanhamento`, `sem_resposta`) e `automacao_travada = false`, muda lead para `em_conversa`.
  - Se `from_me = true` e a mensagem **não** faz parte de um disparo de campanha (checar ausência de vínculo em `disparos_envios` / `campanha_disparos` pelo `wa_message_id` ou pela janela de tempo) → mesma transição para `em_conversa`.

- **Em `leads` (BEFORE UPDATE OF status)**:
  - Se o update vem de uma sessão de usuário (não do service_role das edges), marcar `movido_manualmente_em = now()` e `automacao_travada = true` em `lead_automacao_raia`.
  - Estratégia: usar a função `auth.uid()`; quando `auth.uid() IS NOT NULL` é movimentação humana. Os cron/edges usam service role (uid null).

- **Em `campanha_proposta_lead_canais` (AFTER INSERT)**: nova raia → atualiza `raia_atual`, `raia_entrou_em` e libera `automacao_travada = false`.

### 3. Registro de disparo

Nos edges já existentes (`disparos-callback`, `disparos-webhook`) e no hook `useDisparoManual`:
- Além de mover para `Acompanhamento` quando status = `Novo`, também mover quando status = `sem_resposta` (caso esteja sem automação travada ou a raia acabou de mudar).
- Sempre gravar `ultimo_disparo_em = now()` em `lead_automacao_raia` (upsert).
- Resetar `automacao_travada = false` quando um disparo entra por uma **nova raia**.

### 4. Cron de "sem resposta" (24h)

Novo edge function `acompanhamento-24h-sweeper` + job `pg_cron` a cada 15 min:

```sql
UPDATE leads
SET status = 'sem_resposta', updated_at = now()
FROM lead_automacao_raia a
WHERE leads.id = a.lead_id
  AND leads.status = 'Acompanhamento'
  AND a.automacao_travada = false
  AND a.ultimo_disparo_em < now() - interval '24 hours'
  AND (a.ultima_resposta_em IS NULL OR a.ultima_resposta_em < a.ultimo_disparo_em);
```

### 5. Frontend (`CaptacaoKanban.tsx`)

- Nenhuma mudança de UI obrigatória. Opcional: indicador visual sutil no card ("auto" com `Tooltip` "Status gerenciado automaticamente") quando `automacao_travada = false` e o lead está em `Acompanhamento`/`sem_resposta`/`em_conversa`.
- Realtime já invalida `acompanhamento-leads` quando a tabela `leads` muda.
- No `handleDrop` (drag-and-drop manual) a trigger marcará `automacao_travada = true` automaticamente — nenhuma alteração extra.

### 6. Backfill inicial

- Popular `lead_automacao_raia` para todos os leads com status em (`Acompanhamento`, `sem_resposta`, `em_conversa`) com base em:
  - `ultimo_disparo_em` ← `leads.ultimo_disparo_em`
  - `ultima_resposta_em` ← `max(sigzap_messages.sent_at)` com `from_me=false`
  - `raia_atual` ← última linha aberta em `campanha_proposta_lead_canais`

## Entregáveis

1. Migração: tabela `lead_automacao_raia`, triggers, função helper `is_user_action()` (checa `auth.uid()`).
2. Edge function `acompanhamento-24h-sweeper` + job `pg_cron` `*/15 * * * *`.
3. Ajustes em `disparos-callback`, `disparos-webhook`, `useDisparoManual` e `receive-whatsapp-messages` para:
   - gravar `ultimo_disparo_em` / `ultima_resposta_em`;
   - permitir promoção de `sem_resposta` → `Acompanhamento` em novo disparo;
   - transição automática para `em_conversa` ao chegar resposta / msg do operador.
4. Backfill único populando `lead_automacao_raia`.
5. (Opcional) Tooltip no card indicando que o status está em automação.

## Fora do escopo

- Alterar colunas finais (qualificados, aprovados, descartados, devolução, kanban médico).
- Mudar ordem/labels das colunas existentes.
- Alterar lógica de cascata de raias (`campanha_proposta_lead_canais`) em si — apenas **ler** para destravar automação.
