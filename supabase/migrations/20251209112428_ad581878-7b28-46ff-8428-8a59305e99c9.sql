-- Create table for lead attachments
CREATE TABLE public.lead_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_tipo TEXT,
  arquivo_tamanho INTEGER,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_anexos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view lead attachments"
ON public.lead_anexos FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert lead attachments"
ON public.lead_anexos FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete lead attachments"
ON public.lead_anexos FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create storage bucket for lead attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-anexos', 'lead-anexos', true);

-- Storage policies
CREATE POLICY "Authenticated users can view lead attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload lead attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete lead attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);