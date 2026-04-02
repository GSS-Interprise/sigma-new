
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS api_enrich_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS api_enrich_last_attempt timestamptz,
  ADD COLUMN IF NOT EXISTS api_enrich_source text;

CREATE INDEX IF NOT EXISTS idx_leads_enrich_status 
  ON public.leads(api_enrich_status, api_enrich_last_attempt);
