# Suporte a enquete e contato (e localização) no fluxo sigma-evo

## Diagnóstico

Olhando os registros recentes da instância `teste5847` em `sigzap_messages` e o payload bruto entregue pelo novo workflow do n8n:

**Enquete (`pollCreationMessageV3`)**
- Payload: `raw_payload.data.message.pollCreationMessageV3 = { name, options[], selectableOptionsCount }`
- Resultado salvo: `message_type = 'unknown'`, `message_text = '[Mensagem sem conteúdo]'`.
- Causa: a função `extractMessageContent` em `supabase/functions/receive-whatsapp-messages/index.ts` não tem nenhum branch para `pollCreationMessage` / `pollCreationMessageV2` / `pollCreationMessageV3`. Cai no `return '[Mensagem sem conteúdo]'`.

**Contato (`contactMessage`)**
- Payload: `raw_payload.data.message.contactMessage = { displayName, vcard }`
- Resultado salvo: `message_type = 'contact'`, `message_text = '[Contato: Amanda GSS]'`, mas `contact_data = NULL`.
- Causas:
  1. A função extrai apenas o `displayName` para virar texto — não popula a coluna `contact_data` (jsonb) que já existe no schema.
  2. A UI (`SigZapChatColumn.tsx`) não tem `case 'contact'` em `renderMessageContent`, então cai no fallback que mostra só o texto `[Contato: ...]` em vez de um cartão de contato com nome + telefone + ação.

**Localização** tem o mesmo problema do contato (já há coluna `location_data` mas não é populada nem renderizada). Aproveito para corrigir junto, é uma linha.

Conclusão: **é o JS** (edge function + UI), não a estrutura. O n8n novo está enviando o payload Evolution cru, e a edge function só foi adaptada para campos de mídia comuns — enquete não foi adaptada e contato/localização não populam as colunas dedicadas.

## Mudanças

### 1. `supabase/functions/receive-whatsapp-messages/index.ts`

**a) Adicionar branch de enquete em `extractMessageContent`** (lê das duas formas — pré-processada pelo n8n e crua):

```ts
// Enquete (poll) – aceita V1, V2 e V3
const pollMsg =
  evolutionMessage.pollCreationMessageV3 ||
  evolutionMessage.pollCreationMessageV2 ||
  evolutionMessage.pollCreationMessage ||
  msg?.pollCreationMessageV3 ||
  msg?.pollCreationMessageV2 ||
  msg?.pollCreationMessage;

if (msgType === 'poll' || msgType?.startsWith('pollCreation') || pollMsg) {
  const options = (pollMsg?.options || []).map((o: any) => o.optionName).filter(Boolean);
  return {
    text: `[Enquete: ${pollMsg?.name || 'sem título'}]`,
    type: 'poll',
    pollData: {
      name: pollMsg?.name || '',
      options,
      selectableOptionsCount: pollMsg?.selectableOptionsCount ?? 1,
    },
  };
}
```

**b) Enriquecer o branch de contato** para extrair telefone/vcard e devolver `contactData`:

```ts
if (msgType === 'contact' || msgType === 'vcard' || evolutionMessage.contactMessage || msg?.contactMessage) {
  const ctcMsg = evolutionMessage.contactMessage || msg?.contactMessage || {};
  const vcard = ctcMsg.vcard || '';
  const phone = (vcard.match(/TEL[^:]*:([+\d\s\-()]+)/) || [])[1]?.trim() || null;
  return {
    text: `[Contato: ${ctcMsg.displayName || 'sem nome'}]`,
    type: 'contact',
    contactData: {
      displayName: ctcMsg.displayName || null,
      phone,
      vcard,
    },
  };
}
```

**c) Localização** — devolver também `locationData`:

```ts
if (msgType === 'location' || evolutionMessage.locationMessage || msg?.locationMessage) {
  const locMsg = evolutionMessage.locationMessage || msg?.locationMessage || {};
  return {
    text: `[Localização]`,
    type: 'location',
    locationData: {
      latitude: locMsg.degreesLatitude,
      longitude: locMsg.degreesLongitude,
      name: locMsg.name || null,
      address: locMsg.address || null,
    },
  };
}
```

**d) No INSERT (linha ~989)** popular as colunas a partir do `messageContent` quando vierem da extração (não só do `payload.*`):

```ts
location_data: payload.location_data ?? messageContent.locationData ?? null,
contact_data:  payload.contact_data  ?? messageContent.contactData  ?? null,
// e novo:
poll_data:     payload.poll_data     ?? messageContent.pollData     ?? null,
```

**e) Tipos** — atualizar a `interface EvolutionMessage` com os campos opcionais (`pollCreationMessageV3`, etc.) e o tipo de retorno de `extractMessageContent` para incluir `pollData`/`contactData`/`locationData`.

### 2. Migration aditiva: nova coluna `poll_data jsonb null`

```sql
ALTER TABLE public.sigzap_messages
  ADD COLUMN IF NOT EXISTS poll_data jsonb;
```

Sem `NOT NULL`, sem default — não quebra nada.

### 3. UI: `src/components/sigzap/SigZapChatColumn.tsx`

**a) Adicionar `contact_data`, `location_data`, `poll_data` à interface `Message`** e ao `select(...)` da query de mensagens (se hoje usa `*`, já vem; se for explícito, incluir).

**b) Adicionar `case` em `renderMessageContent`** para renderizar cartões dedicados em vez do fallback "Contato"/"sem conteúdo":

- `case 'contact'`: cartão com avatar/ícone, nome do contato, telefone clicável (link `tel:` + botão "Iniciar conversa" se telefone existir).
- `case 'location'`: bloco com lat/long, nome/endereço (se houver) e link "Abrir no Google Maps" (`https://maps.google.com/?q=lat,lng`).
- `case 'poll'`: cartão estilo WhatsApp com título da enquete + lista de opções (radio/checkbox visual, somente leitura — sem voto, pois Evolution não envia respostas individuais aqui).

Visual segue o padrão atual das bolhas (cores `isFromMe`, `rounded-lg`, etc.). Sem dependências novas.

### 4. Backfill (opcional, defensivo)

As mensagens já gravadas podem ser reaproveitadas porque o `raw_payload` tem tudo. Posso adicionar um pequeno bloco no início do `renderMessageContent` que, se a coluna `contact_data`/`location_data`/`poll_data` estiver vazia, tenta reconstruir on-the-fly a partir de `msg.raw_payload?.data?.message`. Assim as mensagens antigas (Tu/Porem, Amanda GSS) já aparecem corretas sem precisar reprocessar.

## Garantias de não-quebra

- Edge function: só adiciona branches novos antes do `return '[Mensagem sem conteúdo]'`. Fluxo antigo continua igual.
- Migration: 1 coluna `NULL`.
- UI: adiciona `case`s ao `switch`; o `default` permanece. Nenhum componente existente é modificado.
- Sem alteração em send/receive, RLS, dedup, mídia.

## Resumo

| Arquivo | Mudança |
|---|---|
| `supabase/functions/receive-whatsapp-messages/index.ts` | +3 branches (poll, contact enriquecido, location enriquecido), tipos, INSERT |
| Nova migration | `+poll_data jsonb` em `sigzap_messages` |
| `src/components/sigzap/SigZapChatColumn.tsx` | `case 'contact' / 'location' / 'poll'` em `renderMessageContent` + fallback via `raw_payload` |

Aprovando, executo as 3 mudanças e a partir do próximo webhook (e nas mensagens já existentes via fallback do `raw_payload`) a enquete vira cartão de enquete e o contato vira cartão de contato com telefone clicável.
