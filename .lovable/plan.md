# Plano: Suporte simultâneo ao fluxo antigo e ao novo n8n sigma-evo

## Objetivo

Permitir que **ambos os fluxos do n8n** (o antigo, atualmente em produção, e o novo sigma-evo com extração rica de metadados) enviem para a mesma edge function `receive-whatsapp-messages` durante a fase de testes — **sem quebrar envio/recebimento de mensagens** e **sem alterar formatos existentes**.

Você poderá ativar o fluxo novo no n8n em paralelo, comparar resultados, e só depois desligar o antigo.

## Por que é seguro

A edge function atual (`supabase/functions/receive-whatsapp-messages/index.ts`, 1081 linhas) já foi escrita de forma **defensiva e tolerante**:

- Lê campos normalizados do n8n (`message_type`, `from_me`, `sender_jid`, `instance_uuid`, `sender_lid`) **se existirem**
- Se não existirem, faz fallback para `raw_payload.data.*` (estrutura crua da Evolution API)
- Salva sempre `raw_payload` integral, então nenhum dado é perdido

O fluxo novo do n8n preserva o `raw_payload` e adiciona campos novos. A edge function atual simplesmente **ignora os campos que não conhece** — não dá erro.

Conclusão: **o fluxo novo já funciona hoje**, mesmo sem nenhuma alteração. Só que os campos extras (`is_forwarded`, `location_data`, etc.) seriam descartados.

## Estratégia: aditiva, não destrutiva

Toda mudança será **aditiva**:
- Colunas novas no banco → `NULL` por padrão (registros antigos não quebram)
- Leitura de campos novos na edge function → com `?? null` (se não vier, fica nulo)
- Lógica antiga 100% preservada (mesma assinatura de insert, mesmos campos obrigatórios)

## Etapas

### 1. Migration aditiva em `sigzap_messages`

Adicionar colunas opcionais (todas `NULL` por padrão):

| Coluna | Tipo | Origem (fluxo novo) |
|---|---|---|
| `is_forwarded` | `boolean` | `payload.is_forwarded` |
| `forward_score` | `integer` | `payload.forward_score` |
| `location_data` | `jsonb` | `payload.location_data` |
| `contact_data` | `jsonb` | `payload.contact_data` |
| `quoted_message_type` | `text` | `payload.quoted_message_type` |
| `quoted_message_participant` | `text` | `payload.quoted_message_participant` |

Nenhuma alteração em colunas existentes. Nenhum `NOT NULL`. Nenhum constraint novo.

### 2. Patch na edge function `receive-whatsapp-messages`

Apenas **adicionar leitura** dos campos novos no bloco de insert (perto da linha 977-989). Estrutura:

```ts
.insert({
  // ...todos os campos atuais permanecem iguais...
  raw_payload: rawPayload,
  // Campos novos (somente populados quando vierem do fluxo novo):
  is_forwarded: payload.is_forwarded ?? null,
  forward_score: payload.forward_score ?? null,
  location_data: payload.location_data ?? null,
  contact_data: payload.contact_data ?? null,
  quoted_message_type: payload.quoted_message_type ?? null,
  quoted_message_participant: payload.quoted_message_participant ?? null,
})
```

Adicionar também os tipos no `interface EvolutionMessage` (campos opcionais).

**Nada mais é alterado.** A lógica de detecção de mídia, download, dedup, leads, reactions, send/receive — tudo continua idêntico.

### 3. Como diferenciar nos testes

Para você comparar os fluxos durante o paralelo, pode filtrar no Supabase:

```sql
-- Mensagens vindas do fluxo novo (têm pelo menos um campo novo populado)
SELECT * FROM sigzap_messages
WHERE is_forwarded IS NOT NULL
   OR location_data IS NOT NULL
   OR contact_data IS NOT NULL
ORDER BY created_at DESC;

-- Mensagens do fluxo antigo (todos os campos novos nulos)
SELECT * FROM sigzap_messages
WHERE is_forwarded IS NULL
  AND location_data IS NULL
  AND contact_data IS NULL
ORDER BY created_at DESC;
```

## Garantias de não-quebra

| Risco | Mitigação |
|---|---|
| Mensagem do fluxo antigo deixa de ser inserida | Impossível — nenhuma coluna obrigatória nova, nenhuma lógica removida |
| Envio de mensagem (`send-sigzap-message`) afetado | Não é tocado — função totalmente separada |
| Formato de mensagens na UI muda | Não — UI continua lendo as mesmas colunas (`text_content`, `message_type`, etc.) |
| Mídia (imagem/áudio/vídeo) para de baixar | Não — lógica de mídia usa `raw_payload`, que ambos os fluxos enviam |
| Reactions deixam de funcionar | Não — mesma fonte (`raw_payload.data.message.reactionMessage`) |
| Dedup de conversa quebra | Não — chave de dedup (`remoteJid`) vem do `raw_payload` em ambos |

## Recomendação para o n8n

Mantenha o webhook do fluxo novo **apontando para a mesma URL** da edge function (`receive-whatsapp-messages`). Ative os dois workflows simultaneamente no n8n. A edge function aceitará os dois formatos sem distinção.

Quando estiver confiante, desative o antigo no n8n — sem precisar mexer no código.

## Resumo do que será alterado

- **1 migration** (adiciona 6 colunas opcionais em `sigzap_messages`)
- **1 arquivo** editado: `supabase/functions/receive-whatsapp-messages/index.ts` (adiciona ~10 linhas no insert + tipos)
- **0 alterações** em frontend, em `send-sigzap-message`, em outras edge functions, em RLS, em tabelas existentes

Aprovando, executo as duas etapas e você pode ativar o fluxo novo no n8n em paralelo ao antigo.
