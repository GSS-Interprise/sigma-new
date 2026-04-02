-- Create table for lead etiquetas configuration (similar to licitacoes_etiquetas_config)
CREATE TABLE IF NOT EXISTS public.leads_etiquetas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  cor_id TEXT NOT NULL DEFAULT 'gray',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads_etiquetas_config ENABLE ROW LEVEL SECURITY;

-- Create policies for leads_etiquetas_config
CREATE POLICY "Authenticated users can view lead etiquetas config"
ON public.leads_etiquetas_config
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert lead etiquetas config"
ON public.leads_etiquetas_config
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update lead etiquetas config"
ON public.leads_etiquetas_config
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete lead etiquetas config"
ON public.leads_etiquetas_config
FOR DELETE
TO authenticated
USING (true);

-- Add trigger to update updated_at
CREATE OR REPLACE TRIGGER update_leads_etiquetas_config_updated_at
BEFORE UPDATE ON public.leads_etiquetas_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();