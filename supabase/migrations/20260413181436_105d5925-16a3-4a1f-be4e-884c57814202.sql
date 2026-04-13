
-- 1. Create the lead_enrichments table
CREATE TABLE public.lead_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  pipeline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  source TEXT,
  attempt_count INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (lead_id, pipeline)
);

-- 2. Indexes
CREATE INDEX idx_lead_enrichments_status ON public.lead_enrichments(pipeline, status, last_attempt_at);
CREATE INDEX idx_lead_enrichments_lead ON public.lead_enrichments(lead_id);

-- 3. Auto-update updated_at trigger
CREATE TRIGGER update_lead_enrichments_updated_at
  BEFORE UPDATE ON public.lead_enrichments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable RLS
ALTER TABLE public.lead_enrichments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lead_enrichments"
  ON public.lead_enrichments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert lead_enrichments"
  ON public.lead_enrichments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update lead_enrichments"
  ON public.lead_enrichments FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Service role full access to lead_enrichments"
  ON public.lead_enrichments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. Migrate existing data from leads columns into lead_enrichments
INSERT INTO public.lead_enrichments (lead_id, pipeline, status, source, last_attempt_at, completed_at)
SELECT
  id,
  'enrich_v1',
  COALESCE(api_enrich_status, 'pendente'),
  api_enrich_source,
  api_enrich_last_attempt,
  CASE WHEN api_enrich_status IN ('concluido', 'alimentado') THEN api_enrich_last_attempt ELSE NULL END
FROM public.leads
WHERE api_enrich_status IS NOT NULL
ON CONFLICT (lead_id, pipeline) DO NOTHING;
