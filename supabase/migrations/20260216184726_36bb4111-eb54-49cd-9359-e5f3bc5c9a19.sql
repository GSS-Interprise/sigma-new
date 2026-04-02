
-- Table to track leads sent to "Região de Interesse"
CREATE TABLE public.regiao_interesse_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  encaminhado_por UUID REFERENCES auth.users(id),
  encaminhado_por_nome TEXT,
  ufs TEXT[] DEFAULT '{}',
  cidades TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.regiao_interesse_leads ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Authenticated users can view regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR SELECT
  TO authenticated USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR INSERT
  TO authenticated WITH CHECK (true);

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR DELETE
  TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX idx_regiao_interesse_leads_lead_id ON public.regiao_interesse_leads(lead_id);
