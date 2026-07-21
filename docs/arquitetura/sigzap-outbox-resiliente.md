# SigZap — caixa de saída resiliente

## Problema resolvido

O envio manual era uma chamada síncrona do navegador para a Evolution. Quando o
socket retornava `400 Connection Closed`, o campo era limpo e a tentativa não
ficava registrada como mensagem. O estado `open` salvo no banco também podia
estar atrasado em relação ao socket real.

## Fluxo atual

1. O frontend cria um `client_message_id` UUID.
2. `send-sigzap-message` grava a tentativa em `sigzap_outbox` antes de chamar a
   Evolution.
3. O backend consulta `connectionState` real e executa o envio pelo
   `_shared/evo-sender.ts`.
4. `400 Connection Closed` recebe retry exponencial e, se persistir, a mensagem
   volta para `queued`.
5. O cron `sigzap-outbox-worker-every-minute` chama `sigzap-outbox-worker`, que
   usa claim atômico (`FOR UPDATE SKIP LOCKED`) e reprocessa até `max_attempts`.
6. No sucesso, a tentativa vira uma linha de `sigzap_messages` usando o mesmo
   `client_message_id`, evitando duplicidade lógica.

## Estados operacionais

| Estado | Comportamento |
|---|---|
| `queued` | Visível no chat como “Aguardando conexão” |
| `processing` | Worker ou chamada síncrona tentando enviar |
| `failed` | Visível com botão “Tentar novamente” |
| `sent` | Vinculada a `sigzap_messages`; não aparece como pendência |
| `cancelled` | Duplicata legada suprimida; nunca será enviada |

O frontend restaura o texto quando ocorre falha fatal. Navegadores antigos, que
ainda não enviam `client_message_id`, são deduplicados por conversa, tipo e
conteúdo numa janela de cinco minutos.

## Diagnóstico

- Tentativas persistidas: `sigzap_outbox`.
- Resultado de cada chamada à Evolution: `chip_send_log`.
- Saúde e bloqueios do chip: `chip_health_event` e `pre_send_check_result`.
- Cron: `cron.job` com nome `sigzap-outbox-worker-every-minute`.

Não trocar automaticamente de chip: a identidade usada na conversa pode fazer
parte da regra operacional. A interface deve oferecer a decisão à operadora.
