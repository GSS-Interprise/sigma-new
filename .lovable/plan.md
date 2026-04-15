
# Reestruturação: Colunas por Linha de Alimentação em `lead_enrichments`

## Conceito

Cada lead tem **uma única row** em `lead_enrichments` com 15 colunas (3 por pipeline).
Busca simples: `SELECT enrich_three FROM lead_enrichments WHERE lead_id = 'uuid'`.

## Tabela `lead_enrichments` — Colunas por Pipeline

| Pipeline | Coluna boolean | Coluna attempt | Coluna expires | Validade |
|----------|---------------|----------------|----------------|----------|
| enrich_v1 (Tiago) | enrich_one | last_attempt_at_one | expires_at_one | 4 anos (48 meses) |
| enrich_residentes | enrich_two | last_attempt_at_two | expires_at_two | sem validade |
| enrich_lemit | enrich_three | last_attempt_at_three | expires_at_three | 4 anos (48 meses) |
| enrich_lifeshub | enrich_four | last_attempt_at_four | expires_at_four | 4 anos (48 meses) |
| enrich_especialidade | enrich_five | last_attempt_at_five | expires_at_five | sem validade |

## Colunas gerais (mantidas para log)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| lead_id | uuid FK UNIQUE | Referência ao lead (uma row por lead) |
| status | text | Último status geral |
| source | text | Fonte do último enriquecimento |
| completed_at | timestamptz | Último completed |
| result_data | jsonb | Dados retornados |
| error_message | text | Mensagem de erro |

## Queries

```sql
-- Lead já alimentado pelo pipeline lemit?
SELECT enrich_three FROM lead_enrichments WHERE lead_id = 'uuid';

-- Leads NÃO alimentados pelo pipeline lemit
SELECT l.* FROM leads l
LEFT JOIN lead_enrichments le ON le.lead_id = l.id
WHERE (le.id IS NULL OR le.enrich_three = false)
  AND l.merged_into_id IS NULL;
```

## Edge functions

- `enrich-lead` — upsert na coluna específica (enrich_one, etc.) + expires_at
- `query-leads-for-enrich` — busca leads onde enrich_X = false
- `import-leads` — cria row em lead_enrichments com enrich_one ao importar

## Status: ✅ Implementado (v3 — colunas por pipeline, sem coluna pipeline)
