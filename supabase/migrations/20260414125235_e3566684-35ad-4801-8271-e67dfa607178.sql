-- Migrar leads faltantes para lead_enrichments
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