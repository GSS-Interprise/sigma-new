
ALTER TABLE public.lead_enrichments 
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_version text DEFAULT '1.0';

-- Preencher enriched_at para registros já concluídos
UPDATE public.lead_enrichments 
SET enriched_at = completed_at 
WHERE status = 'concluido' AND enriched_at IS NULL;

-- Index para queries de expiração
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_expiry 
ON public.lead_enrichments (pipeline, expires_at) 
WHERE expires_at IS NOT NULL;

COMMENT ON COLUMN public.lead_enrichments.enriched_at IS 'Data em que os dados de enriquecimento foram aplicados ao lead';
COMMENT ON COLUMN public.lead_enrichments.expires_at IS 'Data de expiração/desatualização dos dados enriquecidos';
COMMENT ON COLUMN public.lead_enrichments.pipeline_version IS 'Versão do pipeline de enriquecimento';
