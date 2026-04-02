-- Tabela para documentos de contratos AGES
CREATE TABLE public.ages_contratos_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  observacoes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_contratos_documentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR DELETE TO authenticated USING (true);