

# Colunas por Linha de Alimentação em `lead_enrichments` + Validades Atualizadas

## Conceito

Tabela `lead_enrichments` passa de múltiplas rows por lead (uma por pipeline) para **uma única row por lead** com 15 colunas (3 por linha). Busca simples: `SELECT enrich_three FROM lead_enrichments WHERE lead_id = 'uuid'`.

## Validades (conforme solicitado)

| Pipeline | Coluna | Validade |
|----------|--------|----------|
| enrich_v1 (Tiago) | enrich_one | **4 anos (48 meses)** |
| enrich_residentes | enrich_two | **sem validade** (expires_at = NULL) |
| enrich_lemit | enrich_three | **4 anos (48 meses)** |
| enrich_lifeshub | enrich_four | **4 anos (48 meses)** |
| enrich_especialidade | enrich_five | **sem validade** (expires_at = NULL) |

## Passo 1 — Migração SQL

1. Adicionar 15 colunas:
   - `enrich_one` (bool NOT NULL DEFAULT false), `last_attempt_at_one` (timestamptz), `expires_at_one` (timestamptz)
   - Repetir para `_two`, `_three`, `_four`, `_five`

2. Backfill: consolidar rows existentes numa única row por `lead_id`
   - Row com `pipeline = 'enrich_v1'` e status `concluido`/`alimentado` → `enrich_one = true`, copiar datas
   - Idem para os outros 4 pipelines

3. Mudar constraint unique de `(lead_id, pipeline)` para `(lead_id)`

4. Dropar coluna `pipeline` (agora implícita)

5. Criar 5 índices parciais: `WHERE enrich_one = false`, etc.

6. Dropar índices antigos que usavam `pipeline`

## Passo 2 — Atualizar `enrich-lead`

- Mapear pipeline → coluna (`enrich_v1` → `_one`, etc.)
- No sucesso: `UPDATE SET enrich_one = true, last_attempt_at_one = now, expires_at_one = now + 48 meses` (ou NULL para pipelines sem validade)
- Upsert na row (criar se não existir)
- Atualizar `PIPELINE_VALIDITY`: `enrich_v1: 48`, `enrich_residentes: null`, `enrich_lemit: 48`, `enrich_lifeshub: 48`, `enrich_especialidade: null`

## Passo 3 — Atualizar `query-leads-for-enrich`

Simplificar para:
```sql
SELECT l.* FROM leads l
LEFT JOIN lead_enrichments le ON le.lead_id = l.id
WHERE (le.id IS NULL OR le.enrich_three = false)
  AND l.merged_into_id IS NULL
LIMIT 500
```

## Passo 4 — Atualizar `import-leads`

Ao criar lead, criar row em `lead_enrichments` com todos `enrich_*` = false.

## Passo 5 — Atualizar `plan.md` e tipos

## Arquivos alterados

- 1 migração SQL
- `supabase/functions/enrich-lead/index.ts`
- `supabase/functions/query-leads-for-enrich/index.ts`
- `supabase/functions/import-leads/index.ts`
- `.lovable/plan.md`

