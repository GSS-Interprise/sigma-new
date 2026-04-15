

# Reestruturação da tabela `lead_enrichments`

## Situação atual

A tabela já suporta múltiplas linhas por lead via unique constraint `(lead_id, pipeline)`. Hoje só existe o pipeline `enrich_v1` com ~122k registros. A estrutura base está ok, mas faltam colunas para controlar **quando o enriquecimento foi realizado** e **quando os dados ficam desatualizados**.

## Pipelines planejados

| Pipeline | Descrição | Status atual |
|----------|-----------|-------------|
| `enrich_v1` | Linha 1 — import-leads (Tiago) | Em uso |
| `enrich_residentes` | Linha 2 — Residentes | Em construção |
| `enrich_lemit` | Lemit | Futuro |
| `enrich_lifeshub` | Lifeshub ByName | Futuro |

## Alterações no banco

Adicionar 2 colunas a `lead_enrichments`:

1. **`enriched_at`** (`timestamptz`, nullable) — Data/hora em que o enriquecimento foi efetivamente concluído com sucesso (diferente de `completed_at` que marca fim do processamento; esta marca quando os dados foram de fato aplicados ao lead).

2. **`expires_at`** (`timestamptz`, nullable) — Data de desatualização/expiração dos dados. Cada pipeline pode definir sua validade (ex: 6 meses para Lifeshub, 1 ano para residentes).

Também criar uma coluna de metadados do pipeline:

3. **`pipeline_version`** (`text`, nullable, default `'1.0'`) — Versão do pipeline, útil para rastrear mudanças futuras nos processos de enriquecimento.

### SQL da migração

```sql
ALTER TABLE lead_enrichments 
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_version text DEFAULT '1.0';

-- Preencher enriched_at para registros já concluídos
UPDATE lead_enrichments 
SET enriched_at = completed_at 
WHERE status = 'concluido' AND enriched_at IS NULL;

-- Index para queries de expiração
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_expiry 
ON lead_enrichments (pipeline, expires_at) 
WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN lead_enrichments.enriched_at IS 'Data em que os dados de enriquecimento foram aplicados ao lead';
COMMENT ON COLUMN lead_enrichments.expires_at IS 'Data de expiração/desatualização dos dados enriquecidos';
COMMENT ON COLUMN lead_enrichments.pipeline_version IS 'Versão do pipeline de enriquecimento';
```

## Impacto no código

- **Nenhuma quebra**: As colunas são nullable, o código existente continua funcionando.
- **Edge functions** (`enrich-lead`, `import-leads`): Quando marcarem `status = 'concluido'`, devem também setar `enriched_at = now()` e `expires_at` conforme a validade do pipeline.
- **UI (LeadsTab)**: Futuramente as insígnias de enriquecimento poderão consultar `enriched_at` e `expires_at` para mostrar status visual (válido, expirado, pendente) por pipeline.

## Resumo

Apenas uma migração com 3 novas colunas + backfill + índice. Sem alteração de código obrigatória nesta etapa — preparação para os pipelines futuros.

