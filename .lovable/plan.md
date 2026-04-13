

## Plano: Criar tabela `lead_enrichments` e migrar dados existentes

### Estrutura proposta

```sql
CREATE TABLE lead_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  pipeline TEXT NOT NULL,          -- ex: 'enrich_v1', 'alimentacao_v2', 'validacao_telefone'
  status TEXT NOT NULL DEFAULT 'pendente',  -- pendente, em_processamento, concluido, alimentado, erro
  source TEXT,                     -- fonte dos dados (API externa, planilha, etc.)
  attempt_count INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_data JSONB,              -- dados retornados pelo pipeline (flexível)
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE (lead_id, pipeline)      -- 1 registro por lead por pipeline
);

CREATE INDEX idx_lead_enrichments_status ON lead_enrichments(pipeline, status, last_attempt_at);
CREATE INDEX idx_lead_enrichments_lead ON lead_enrichments(lead_id);
```

### Passos de implementação

1. **Criar a tabela `lead_enrichments`** via migration com a estrutura acima, incluindo trigger de `updated_at` e RLS.

2. **Migrar dados existentes** — INSERT INTO `lead_enrichments` a partir das colunas atuais de `leads` (pipeline = `'enrich_v1'`), preservando status/source/last_attempt.

3. **Atualizar Edge Functions** (`get-pending-leads`, `query-leads-for-enrich`, `enrich-lead`) para ler/escrever na nova tabela em vez das colunas `api_enrich_*` da tabela leads.

4. **Atualizar o frontend** — `useLeadsPaginated.ts` (filtro de enrichStatus) e componentes que mostram status de enriquecimento passam a fazer JOIN ou subquery na `lead_enrichments`.

5. **Remover colunas legadas** — após validação, dropar `api_enrich_status`, `api_enrich_last_attempt`, `api_enrich_source` da tabela leads (pode ser feito numa fase posterior para segurança).

### Benefícios concretos

- **Queries de listagem** (a mais usada, 50 leads por página): não carregam dados de enriquecimento desnecessariamente.
- **Novos pipelines**: basta inserir rows com `pipeline = 'novo_nome'`, zero migrations de schema.
- **Histórico**: `result_data` JSONB armazena o que cada pipeline retornou, auditável.
- **N8N**: o endpoint `get-pending-leads` filtra por `pipeline + status` na tabela menor e indexada.

### Sobre o N8N

O workflow que você mostrou (`get-pending-leads` com limit=500) continuará funcionando — apenas o endpoint interno muda para consultar `lead_enrichments` em vez de `leads.api_enrich_status`. A URL e autenticação ficam iguais.

