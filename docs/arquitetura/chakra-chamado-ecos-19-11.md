# Chamado na Chakra: smb_message_echoes pararam em 19/11/2026

**Aberto em 22/11/2026 pela API, na conta da GSS: chamado #2224** (id `a1990019-e281-46c8-9763-bfc7c788c6f8`, status OPEN).
Para ler as respostas: edge `chakra-diagnostico` com `{"acao":"chamado_ver","id":"a1990019-e281-46c8-9763-bfc7c788c6f8"}`
(só service_role). Criar e listar: `chamado_criar` e `chamados_listar`.

Texto enviado:

---

**Subject:** Coexistence message echoes (smb_message_echoes) stopped being delivered since Nov 19, 2026 — plugin d9a6180c

Hi Chakra team,

Since **Nov 19, 2026, between 13:23 and 19:00 UTC**, we stopped receiving `smb_message_echo` events (messages typed by
our team in the WhatsApp Business app, coexistence) on our pass-through / Chakra webhook, for **all** coexistence numbers of our
plugin. Until Nov 19 we received 200–550 of these events per day; since then, zero.

**Plugin:** `d9a6180c-4ae4-4ed4-9c16-401b781e1ee7` (Sigma GSS - WhatsApp)
**Webhook:** `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/chakra-webhook`
**Plugin config (read from `/v1/ext/plugin/whatsapp/{plugin}/config` today):** `enableMessageEchoesForPassThroughWebhook: true`,
`whichChakraWebhookEventsToSend: ["message", "status", "message_echo", "smb_message_echo"]`.

| Phone number ID | Last smb_message_echo received (UTC) |
|---|---|
| 238442722693276 | 2026-11-19 19:00 |
| 1209633665576903 | 2026-11-19 16:33 |
| 1110780332121386 | 2026-11-19 14:34 |
| 1228671447001103 | 2026-11-19 13:59 |
| 1265298783330718 | 2026-11-19 13:23 |

What still works on the same webhook:
- inbound `message`, `status`/`statuses`, and `message_echo` with `source.sourceType = API`;
- `smb_app_state_sync` — e.g. phone number ID 1209633665576903 sent contact syncs on 2026-11-20 23:07 UTC and
  2026-11-21 02:11 UTC, so the Business app is still linked (coexistence active). Only the message echoes stopped.

Nothing changed on our side (no deploy of the webhook between Nov 15 and Nov 22; it does not reject requests).

Could you check:
1. whether the `smb_message_echoes` webhook field is still subscribed for these WABAs/numbers on your Meta app;
2. whether these echoes are reaching Chakra and failing to be forwarded to our webhook (any delivery errors on your side
   since Nov 19);
3. if anything changed on Nov 19 (Chakra or Meta) that requires an action from us.

Thanks!

---

## Andamento
- **22/11, resposta da Chakra:** o plugin d9a6180c (que citei por engano: é o dos avisos internos) está certo, mas os 7
  números estão hoje no plugin `49a435de-00a3-4048-a15e-d96da3b7be7d`, também com o eco ligado. Pediram: números,
  se falta no pass-through ou no webhook da Chakra, e um exemplo com horário.
- **22/11, nossa resposta** (`chamado_responder`): corrigi o plugin; o Sigma ainda guarda um plugin diferente por número
  e três deles não existem mais (c5a9ba61, 83996e9c, f72e550c, finais 0538, 8860 e 7508), então os números foram
  mudados de plugin; perguntei quando (se foi em 19/11, a inscrição do eco pode não ter acompanhado). Respondi as 3
  perguntas e prometi um teste pelo app na segunda, 24/11, com horário exato.
- **Pendente:** teste pelo celular na segunda; atualizar `whatsapp_chakra_connections.plugin_id` para o plugin real.
