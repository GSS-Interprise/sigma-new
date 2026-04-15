
# Reestruturação: Colunas de Alimentação na Tabela `leads`

## Abordagem

Cada linha de alimentação tem 3 colunas diretas na tabela `leads`:
- `enrich_X` (boolean, default false) — alimentado?
- `last_attempt_at_X` (timestamptz) — última tentativa
- `expires_at_X` (timestamptz) — validade dos dados

## Linhas de alimentação

| Linha | Colunas | Pipeline | Validade |
|-------|---------|----------|----------|
| 1 | enrich_one, last_attempt_at_one, expires_at_one | enrich_v1 (Import-leads/Tiago) | 12 meses |
| 2 | enrich_two, last_attempt_at_two, expires_at_two | enrich_residentes | 6 meses |
| 3 | enrich_three, last_attempt_at_three, expires_at_three | enrich_lemit | 6 meses |
| 4 | enrich_four, last_attempt_at_four, expires_at_four | enrich_lifeshub | 6 meses |
| 5 | enrich_five, last_attempt_at_five, expires_at_five | enrich_especialidade | 6 meses |

## Queries simplificadas

```sql
-- Buscar leads não alimentados pela Linha 1
SELECT * FROM leads WHERE enrich_one = false AND merged_into_id IS NULL;

-- Buscar leads não alimentados pela Linha 2
SELECT * FROM leads WHERE enrich_two = false AND merged_into_id IS NULL;
```

## Tabela `lead_enrichments`

Mantida como log/auditoria (result_data, error_message, tentativas). As colunas boolean na `leads` são o "estado atual" para buscas rápidas.

## Edge functions atualizadas

- `enrich-lead` — seta enrich_X = true + expires_at ao concluir
- `query-leads-for-enrich` — busca direto em `leads` WHERE enrich_X = false
- `import-leads` — seta enrich_one quando import já traz status concluído

## Status: ✅ Implementado
