

## Plano: Completar migração e remover colunas legadas

### Diagnóstico

- 115.739 leads têm `api_enrich_status` preenchido na tabela `leads`
- 2.729 leads (todos `pendente`) não existem em `lead_enrichments` — foram inseridos após a migration inicial
- As colunas `api_enrich_*` na tabela `leads` são agora redundantes

### Passos

1. **Migration SQL** — uma única migration que:
   - Insere os 2.729 leads faltantes em `lead_enrichments` (mesmo INSERT com `ON CONFLICT DO NOTHING`)
   - Remove as 3 colunas legadas: `api_enrich_status`, `api_enrich_last_attempt`, `api_enrich_source` da tabela `leads`

2. **Atualizar Edge Function `enrich-lead`** — remover o trecho que ainda escreve nas colunas `api_enrich_*` da tabela `leads` (backward compatibility que não é mais necessária)

3. **Atualizar Edge Function `import-leads`** — verificar se ela seta `api_enrich_status` ao inserir leads; se sim, trocar para inserir em `lead_enrichments`

4. **Atualizar frontend** — remover qualquer referência a `api_enrich_status` / `api_enrich_last_attempt` / `api_enrich_source` nos componentes e hooks (fallbacks que leem da tabela `leads`)

5. **Atualizar types.ts** — remover os campos das interfaces do Supabase

### Detalhes técnicos

```sql
-- Migrar leads faltantes
INSERT INTO public.lead_enrichments (lead_id, pipeline, status, source, last_attempt_at)
SELECT id, 'enrich_v1', COALESCE(api_enrich_status, 'pendente'), api_enrich_source, api_enrich_last_attempt
FROM public.leads
WHERE id NOT IN (SELECT lead_id FROM lead_enrichments WHERE pipeline = 'enrich_v1')
  AND api_enrich_status IS NOT NULL
ON CONFLICT (lead_id, pipeline) DO NOTHING;

-- Dropar colunas legadas
ALTER TABLE public.leads DROP COLUMN IF EXISTS api_enrich_status;
ALTER TABLE public.leads DROP COLUMN IF EXISTS api_enrich_last_attempt;
ALTER TABLE public.leads DROP COLUMN IF EXISTS api_enrich_source;
```

### Arquivos afetados

- Nova migration SQL
- `supabase/functions/enrich-lead/index.ts` — remover writes nas colunas legadas
- `supabase/functions/import-leads/index.ts` — inserir em `lead_enrichments` em vez de setar `api_enrich_status`
- `src/hooks/useLeadsPaginated.ts` — remover fallbacks
- `src/components/medicos/LeadsTab.tsx` — remover referências legadas
- `src/components/medicos/LeadProntuarioDialog.tsx` — remover referências legadas
- `src/integrations/supabase/types.ts` — remover campos

