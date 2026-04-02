-- Tabela para anotações do prontuário médico (área de notas rica)
CREATE TABLE public.lead_anotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nota', -- 'nota', 'desconversao', 'blacklist', 'alerta'
  titulo TEXT,
  conteudo TEXT NOT NULL,
  imagens TEXT[] DEFAULT '{}', -- URLs das imagens
  metadados JSONB DEFAULT '{}', -- dados extras como motivo desconversão, etc
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Foreign key para leads
ALTER TABLE public.lead_anotacoes 
ADD CONSTRAINT lead_anotacoes_lead_id_fkey 
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX idx_lead_anotacoes_lead_id ON public.lead_anotacoes(lead_id);
CREATE INDEX idx_lead_anotacoes_tipo ON public.lead_anotacoes(tipo);
CREATE INDEX idx_lead_anotacoes_created_at ON public.lead_anotacoes(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_anotacoes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view lead_anotacoes"
ON public.lead_anotacoes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert lead_anotacoes"
ON public.lead_anotacoes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update lead_anotacoes"
ON public.lead_anotacoes FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete lead_anotacoes"
ON public.lead_anotacoes FOR DELETE
TO authenticated
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lead_anotacoes_updated_at
BEFORE UPDATE ON public.lead_anotacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para imagens das anotações
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lead-anotacoes', 'lead-anotacoes', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do storage
CREATE POLICY "Anyone can view lead-anotacoes images"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-anotacoes');

CREATE POLICY "Authenticated users can upload lead-anotacoes images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-anotacoes');

CREATE POLICY "Authenticated users can delete lead-anotacoes images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-anotacoes');