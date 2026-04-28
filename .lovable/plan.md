# Corrigir contagem de Disparos Manuais no BI Prospec

## Problema

Hoje o BI conta **1 disparo por mensagem** enviada pelo usuário (`sigzap_messages.from_me=true`). Isso infla os números — se a Ester abre uma conversa e envia 5 mensagens no mesmo lead, o BI marca 5 disparos. O correto é **1 disparo manual = 1 conversa aberta pelo usuário** (primeira mensagem `from_me` em uma conversa). Quando o lead é fechado e depois reaberto, conta como **novo disparo**.

## Diagnóstico (dados reais, últimos 60 dias)

| Métrica | Valor |
|---|---|
| Mensagens `from_me` por usuário (lógica atual — errada) | **1.125** |
| Conversas iniciadas pelo usuário (lógica correta) | **105** |
| `disparo_manual_envios` (tabela do painel "Disparo Manual") | **0** |
| Leads com múltiplas reaberturas | sim (1 lead com 7 aberturas) |

A tabela `disparo_manual_envios` está vazia porque o fluxo real (botão verde no painel SIG Zap por proposta) grava direto em `sigzap_messages` via `send-sigzap-message`, sem passar pela tabela de auditoria.

## Definição correta de "Disparo Manual"

> **Um disparo manual é o ato de abrir/iniciar uma janela de conversa com um lead.**
> Mensagens subsequentes na mesma conversa **não contam**. Se a conversa for fechada (`status = 'inactive'` ou similar) e o usuário **reabrir** depois enviando nova mensagem, conta como **novo disparo**.

Operacionalmente: para cada `conversation_id`, considerar como "disparo" cada mensagem `from_me=true` com `sent_by_user_id IS NOT NULL` que seja:
- a **primeira** mensagem do usuário na conversa, OU
- a **primeira mensagem após um período de inatividade / fechamento** (heurística: gap ≥ N dias entre mensagens do user na mesma conversa, OU mudança de `status` da conversa entre as duas).

## Pergunta de negócio (preciso confirmar)

Como o sistema atual **não guarda histórico de fechamento/reabertura** de conversa explicitamente, preciso de uma regra para detectar reabertura. Proponho a heurística mais simples:

**Reabertura = nova mensagem do usuário na mesma conversa após gap ≥ 7 dias sem nenhuma mensagem (de nenhum lado).**

Se preferir outro critério (ex.: 3 dias, 14 dias, ou só contar 1 por conversa para sempre), me avise antes de aplicar.

## Solução técnica

### 1. Migration: atualizar a CTE `manuais` em `get_bi_prospec_dashboard`

Substituir a lógica atual (que conta mensagens) por uma que conta "aberturas de conversa":

```sql
manuais_chat AS (
  WITH msgs AS (
    SELECT
      m.conversation_id,
      c.lead_id,
      m.sent_at,
      m.sent_by_user_id,
      LAG(m.sent_at) OVER (PARTITION BY m.conversation_id ORDER BY m.sent_at) AS prev_sent_at
    FROM public.sigzap_messages m
    JOIN public.sigzap_conversations c ON c.id = m.conversation_id
    WHERE m.from_me = true
      AND m.sent_by_user_id IS NOT NULL
  )
  SELECT lead_id, sent_at AS created_at, sent_by_user_id
  FROM msgs
  WHERE prev_sent_at IS NULL                            -- primeira mensagem da conversa
     OR sent_at - prev_sent_at >= interval '7 days'     -- reabertura após 7 dias de gap
)
-- unir com disparo_manual_envios (caso volte a ser usado no futuro)
```

### 2. Aplicar a mesma lógica em todos os pontos do RPC

- Card "Total Disparos Manuais"
- Gráfico "Evolução Mensal por Tipo" (série Manual)
- Donut "Mix por Tipo" (fatia Manual)
- Aba "Canais" → WhatsApp
- Ranking por usuário (Ester, Bruna, Amanda, Ewerton)

### 3. Validação esperada após o fix

| Métrica | Antes | Depois (estimado) |
|---|---|---|
| Total Manual (60d) | 1.125 | ~105–120 |
| Ester | 119 | ~10–15 |
| Bruna | 464 | ~40–50 |

### 4. Observação sobre status da conversa

Hoje `sigzap_conversations.status` tem valores `open`, `in_progress`, `inactive`, `pending`, mas **não há histórico de transições**. Por isso a heurística de gap temporal é a única forma confiável de detectar reabertura sem mudar o esquema. Se quiser precisão total no futuro, seria necessário criar uma tabela `sigzap_conversation_status_log`.

## Arquivos afetados

- **Nova migration**: `supabase/migrations/<timestamp>_fix_bi_prospec_manual_por_conversa.sql` — recria `get_bi_prospec_dashboard` com a CTE corrigida.
- Nenhum arquivo de frontend muda (o RPC mantém o mesmo contrato de retorno).

## Aguardando aprovação

1. Confirmar regra de reabertura: **gap ≥ 7 dias** está bom? (alternativas: 3d, 14d, ou nunca recontar)
2. Aprovar a migration.
