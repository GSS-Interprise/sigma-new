

# Vincular Conversas SigZap a Leads (com suporte a múltiplos telefones)

## Contexto: como os telefones ficam no lead

| Campo | Tipo | Exemplo |
|-------|------|---------|
| `phone_e164` | text | `+5547999758708` |
| `telefones_adicionais` | text[] | `{"+5548991234567","+5547988887777"}` |

Quando o WhatsApp recebe uma mensagem de `554799758708`, o sistema precisa encontrar o lead **mesmo que esse número esteja em `telefones_adicionais`** e não no campo principal.

## Mudanças no plano

### 1. Migration SQL — coluna `lead_id` + função de lookup

Adicionar `lead_id` à `sigzap_conversations` (como antes) **e** criar uma função SQL `find_lead_by_phone(phone text)` que busca em ambos os campos:

```sql
CREATE OR REPLACE FUNCTION find_lead_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT id FROM leads
  WHERE phone_e164 = p_phone
     OR p_phone = ANY(telefones_adicionais)
  LIMIT 1;
$$;
```

O backfill retroativo também usará essa função para preencher `lead_id` nas conversas existentes.

### 2. Edge Function `receive-whatsapp-messages`

Ao criar/atualizar conversa, normalizar o telefone do contato para E.164 e chamar:

```typescript
const { data: lead } = await supabase.rpc('find_lead_by_phone', { p_phone: normalizedPhone });
```

Se encontrar → setar `lead_id` na conversa e atualizar status do lead para "Acompanhamento" (se for "Novo").

### 3. Edge Function `disparos-callback`

Mesmo lookup quando um disparo é confirmado como enviado.

### 4. Frontend — SigZap components

Sem mudança em relação ao plano anterior: JOIN com `leads(id, nome)` via `lead_id`, priorizar nome do lead.

## Fluxo completo

```text
Mensagem chega de 554799758708
  → normaliza para +5547999758708
  → find_lead_by_phone('+5547999758708')
  → encontra lead (pode estar em phone_e164 OU telefones_adicionais)
  → sigzap_conversations.lead_id = lead.id
  → lead.status = "Acompanhamento" (se era "Novo")
  → UI mostra nome do lead do CRM
```

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | Coluna `lead_id`, index, função `find_lead_by_phone`, backfill |
| `receive-whatsapp-messages/index.ts` | Lookup via RPC, setar lead_id, auto "Acompanhamento" |
| `disparos-callback/index.ts` | Mesmo lookup ao confirmar envio |
| `SigZapConversasColumn.tsx` | Join com leads, priorizar nome do lead |
| `SigZapMinhasConversasColumn.tsx` | Idem |
| `SigZapChatColumn.tsx` | Exibir lead info no header |

