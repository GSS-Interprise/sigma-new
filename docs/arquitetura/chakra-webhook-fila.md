# Fila do webhook da Chakra (WhatsApp oficial)

25/11/2026. Código: `supabase/functions/chakra-webhook/index.ts`. Banco: migrations `20261125160000_chakra_fila_webhook.sql`,
`20261125170000_chakra_mensagem_direto_banco.sql` e `20261125180000_chakra_fila_cron.sql`.

## Por que existe

Às 8h de 25/11 seis números entraram em coexistência (Vinicius, Ester, Eduarda, Danilo, Wagner e Brenda). A Meta
mandou o histórico e os ecos de cada um: cerca de 116 mil eventos em 3 horas, contra uns 300 por hora num dia normal.

O `chakra-webhook` processava cada evento antes de responder à Chakra. Para cada mensagem, chamava o
`receive-whatsapp-messages` por HTTP. Três coisas estouraram:
- o limite de chamada entre funções ("Rate limit exceeded for function");
- o tempo da requisição (504);
- o pool do banco (lentidão no Sigma por volta das 08:45).

Resultado: ~19 mil eventos ficaram como `failed` e ~40 mil ficaram parados em `received`. Nenhum deles seria refeito,
porque a nova tentativa da Chakra cai no `event_hash` único e é descartada como duplicata. Até mensagem ao vivo de
médico ficou parada.

## Como funciona agora

1. **Receber.** O webhook grava cada evento em `whatsapp_chakra_webhook_events` e responde 200 na hora. Cada evento
   leva uma prioridade:

   | Prioridade | O que é |
   |---|---|
   | 1 | mensagem ao vivo |
   | 3 | status de entrega |
   | 7 | mensagem com mais de 30 min (eco ou histórico reenviado) |
   | 8 | backlog reposto à mão |
   | 9 | pacote `history` |

2. **Ao vivo na hora.** Prioridades 1 e 3 são processadas na mesma chamada do webhook, depois da resposta
   (`EdgeRuntime.waitUntil`). A IA e os botões continuam rápidos.

3. **Worker.** O cron `chakra-webhook-fila` roda a cada 30 s e chama o webhook com o cabeçalho `x-sigma-fila`. Ele
   vem do banco (pg_net), então não gasta a cota de chamada entre funções. O worker:
   - reserva lotes com `chakra_fila_reservar` (`FOR UPDATE SKIP LOCKED`, teto de 40 eventos em andamento, reserva
     velha de mais de 5 min volta para a fila);
   - processa 4 eventos por vez, até ~50 s por chamada.

4. **Modo histórico.** Vale para prioridade 7 ou mais, para evento parado há mais de 10 min e para mensagem com mais
   de 30 min.
   - A mensagem é gravada direto no banco por `importar_mensagem_chakra`. Ela usa a mesma regra do importador de
     histórico do celular (`importar_historico_chakra_payload`).
   - Não aciona IA, alerta da equipe, botão, descadastro, status do lead nem contato da equipe. Não soma não lida e
     não troca a "última mensagem" da conversa por uma mais antiga.
   - O `receive-whatsapp-messages` também aceita `sigma_historico: true`, com o mesmo comportamento.

5. **Falha.** `chakra_fila_falhou` devolve o evento à fila com espera de 2, 4, 8, 16 e 32 min. Na 6ª tentativa ele
   vira `failed` e fica para análise.

6. **Sem duplicar.** O receiver confere `provider` + `wa_message_id`. O índice único
   `(conversation_id, wa_message_id)` segura o resto, e o importador usa `on conflict do nothing`. Reprocessar o mesmo
   evento devolve `ja_existiam`.

## Estados de um evento

`received` → `processing` → `processed`. Em caso de erro, `retry` (com `proxima_tentativa_em`) e, depois de 6
tentativas, `failed`. `ignored` grava o motivo em `error_message` (`ignored_unmanaged_phone`, etc.).

## Como acompanhar

```sql
select * from public.chakra_fila_resumo();  -- pendentes por status e prioridade, com o mais antigo
select left(error_message, 120), count(*) from whatsapp_chakra_webhook_events
 where processing_status in ('retry', 'failed') group by 1 order by 2 desc;
```

## Limites conhecidos

- Os tipos `smb_app_state_sync`, `account_update` e outros sem tratamento continuam só registrados.
- Mídia do histórico não é baixada. O id fica guardado para o `chakra-midia-recuperar`.
- Reação enviada pelo celular é descartada.
