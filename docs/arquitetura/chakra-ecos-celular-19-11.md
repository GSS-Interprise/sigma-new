# Ecos do celular pararam de chegar (19/11/2026)

## O que aconteceu
O que a equipe digita no WhatsApp Business do celular (coexistence) chega ao Sigma pelo evento `smb_message_echo` da
Chakra. Até 19/11 eram de 200 a 550 por dia. Em 19/11, entre 13h23 e 19h00 UTC (10h23 a 16h00 de Brasília), parou
em todos os números e não voltou (20/11, um dia útil normal, teve zero).

| Número (final) | phone_number_id | Último eco do celular (UTC) |
|---|---|---|
| 8860 | 238442722693276 | 19/11 19:00 |
| 3416 | 1209633665576903 | 19/11 16:33 |
| 3444 | 1110780332121386 | 19/11 14:34 |
| 3761 | 1228671447001103 | 19/11 13:59 |
| 7508 | 1265298783330718 | 19/11 13:23 |
| 5309 | 1436666289526376 | 18/11 14:46 |
| 2474 | 1386958481170844 | 13/11 16:28 |

## O que continua chegando
- Mensagem recebida (`message`), status (`status`, `statuses`) e o eco do que a API envia (`message_echo`, source
  `API`): normais.
- `smb_app_state_sync` (o app do celular sincronizando contatos): chegou em 20/11 23:07 e 21/11 02:11 no final 3416.
  Ou seja, o app do celular continua ligado à API; só o eco das mensagens deixou de vir.

## Descartado do nosso lado
- Nenhuma mudança no `chakra-webhook` entre 15/11 e 22/11 (git).
- Configuração do plugin GSS na Chakra (`d9a6180c-4ae4-4ed4-9c16-401b781e1ee7`):
  `enableMessageEchoesForPassThroughWebhook: true` e `whichChakraWebhookEventsToSend` com `smb_message_echo`.
- Assinatura: `CHAKRA_WEBHOOK_SECRET` não está configurado, então o webhook não recusa nada por assinatura. O filtro
  de eco só descarta reação.
- Desde 22/11 (commit 5b7afd45) o webhook também registra pacote sem evento reconhecido (`_sem_evento`) e assinatura
  recusada (`_assinatura_recusada`), com o formato e sem o conteúdo. Se o eco voltar num formato novo, aparece ali.

## Próximo passo
1. Teste ao vivo: alguém da equipe manda uma mensagem pelo app do celular de um número conectado (ex.: final 3416) e
   confere em 1 min:
   `select event_type, received_at from whatsapp_chakra_webhook_events order by received_at desc limit 10;`
2. Se nada chegar: chamado na Chakra com esta página (plugin, números, horários).
3. Segurança, achado no caminho: sem `CHAKRA_WEBHOOK_SECRET`, qualquer pessoa que souber a URL consegue gravar
   mensagem falsa no Sigma. Configurar o segredo na Chakra e no Supabase.
