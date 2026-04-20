

## Problema

A Amanda parece estar "falando sozinha" porque o `sigzap-fetch-history` só importa mensagens **enviadas** (fromMe=true). As respostas do lead nunca chegam ao banco.

## Causa raiz (confirmado via Evolution API)

O WhatsApp moderno usa dois identificadores diferentes para o mesmo contato:

| Tipo de mensagem | `key.remoteJid` | `key.remoteJidAlt` |
|---|---|---|
| Enviada pela Amanda (fromMe=true) | `553799659763@s.whatsapp.net` | (vazio) |
| Recebida do lead (fromMe=false) | `110836009947205@lid` | `553799659763@s.whatsapp.net` |

A query atual filtra **apenas** por `key.remoteJid = "<phone>@s.whatsapp.net"`, então pega só as enviadas. As respostas do lead ficam invisíveis porque o `remoteJid` delas é o LID.

Confirmação prática para 553799659763:
- Filtro atual → **2 records** (só fromMe=true)
- Filtro por `remoteJidAlt` → **10 records** (inclui as 2 respostas do lead e mais variações)

## Correção

Em `supabase/functions/sigzap-fetch-history/index.ts`, ao chamar `chat/findMessages`:

1. **Disparar duas chamadas em paralelo** para o mesmo contato:
   - `where: { key: { remoteJid: "<phone>@s.whatsapp.net" } }`
   - `where: { key: { remoteJidAlt: "<phone>@s.whatsapp.net" } }`

2. **Mesclar os resultados** e **deduplicar** por `key.id` (já temos isso via checagem `wa_message_id` no DB, basta unir os arrays antes do loop de processamento).

3. **Ajustar `has_more`**: como agora juntamos duas listas, considerar `has_more = true` se qualquer uma das duas chamadas retornou `limit` registros (mantém paginação manual funcionando).

4. **Persistir o JID real** no `sender_jid` e mensagens recebidas: para `fromMe=false`, o `sender_jid` deve ser `key.remoteJid` (o LID), preservando o vínculo, e podemos opcionalmente guardar o E.164 derivado de `remoteJidAlt` para exibição.

5. **Bonus de robustez**: também aceitar contatos cujo `contact_jid` no nosso DB seja `@lid` — nesse caso, fazer a busca via `remoteJid` direto no LID (já funciona), e adicionalmente uma segunda chamada com o phone E.164 quando disponível em `contact_phone`.

## Por que o auto-sync resolve (depois do fix)

Hoje o auto-sync já roda ao abrir a conversa, então depois da correção, abrir a conversa da Amanda vai trazer as mensagens faltantes automaticamente — sem precisar clicar em "Buscar histórico".

## Observação sobre JWT

A hipótese de "não autorização do token" não procede neste caso: os logs da função mostram chamadas concluídas (200 OK) com `total: 2`. O problema é puramente de filtro no Evolution API, não de autenticação.

## Arquivos a modificar

- `supabase/functions/sigzap-fetch-history/index.ts` — adicionar segunda chamada com `remoteJidAlt`, mesclar resultados, deduplicar, ajustar `has_more` e `sender_jid`.

## Sem mudanças necessárias em

- Frontend (`SigZapChatColumn.tsx`) — o auto-sync e botão "Buscar histórico" continuam funcionando igual; vão simplesmente trazer mais mensagens.
- Webhook receiver — mensagens que chegam em tempo real via webhook já são salvas corretamente.
- Schema do banco.

