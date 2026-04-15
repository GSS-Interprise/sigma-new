
# Reestruturação: Alimentação via Tabela `lead_enrichments`

## Abordagem

Cada linha de alimentação é uma **row na tabela `lead_enrichments`** com `(lead_id, pipeline)` como chave única.

## Tabela `lead_enrichments`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| lead_id | uuid FK | Referência ao lead |
| pipeline | text | Nome do pipeline (chave única com lead_id) |
| status | text | pendente, em_processamento, concluido, alimentado, erro |
| last_attempt_at | timestamptz | Última tentativa |
| completed_at | timestamptz | Quando foi concluído |
| expires_at | timestamptz | Validade dos dados |
| result_data | jsonb | Dados retornados |
| error_message | text | Mensagem de erro |

## Pipelines

| Pipeline | Descrição | Validade |
|----------|-----------|----------|
| enrich_v1 | Import-leads (Tiago) | 12 meses |
| enrich_residentes | Residentes | 6 meses |
| enrich_lemit | Lemit | 6 meses |
| enrich_lifeshub | Lifeshub | 6 meses |
| enrich_especialidade | Especialidade | 6 meses |

## Queries

```sql
-- Leads NÃO alimentados pelo pipeline X
SELECT l.* FROM leads l
LEFT JOIN lead_enrichments le ON le.lead_id = l.id AND le.pipeline = 'enrich_v1'
WHERE (le.id IS NULL OR le.status NOT IN ('concluido', 'alimentado'))
  AND l.merged_into_id IS NULL;
```

## Edge functions

- `enrich-lead` — upsert em lead_enrichments com status + expires_at
- `query-leads-for-enrich` — busca leads sem enrichment concluído para o pipeline
- `import-leads` — cria row em lead_enrichments ao importar

## Status: ✅ Implementado (v2 — colunas removidas de leads)
