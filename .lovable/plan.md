

# Endpoint POST para `lead_especialidades`

## O que será criado

Nova Edge Function `manage-lead-especialidades` que recebe um array de `{ lead_id, especialidade_id }` e insere na junction table `lead_especialidades`. Usa `ON CONFLICT DO NOTHING` para não duplicar.

## Arquivo

**`supabase/functions/manage-lead-especialidades/index.ts`** (novo)

## Lógica

1. Valida Bearer token — aceita exclusivamente `Enriquecedor-leads`
2. Lê body como array: `[{ "lead_id": "uuid", "especialidade_id": "uuid" }, ...]`
3. Valida que cada item tem `lead_id` e `especialidade_id` como strings UUID
4. Faz `upsert` na tabela `lead_especialidades` com `onConflict: 'lead_id,especialidade_id'` e `ignoreDuplicates: true`
5. Retorna quantidade inserida e eventuais erros

## Exemplo de uso no n8n

```
POST https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/manage-lead-especialidades
Authorization: Bearer <token>
Content-Type: application/json

[
  { "lead_id": "aaa-...", "especialidade_id": "bbb-..." },
  { "lead_id": "aaa-...", "especialidade_id": "ccc-..." }
]
```

Resposta:
```json
{ "inserted": 2, "total_received": 2 }
```

