-- Create licitacoes_anexos table
CREATE TABLE public.licitacoes_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licitacoes_anexos ENABLE ROW LEVEL SECURITY;

-- RLS policies (authenticated users can manage)
CREATE POLICY "Authenticated users can view anexos" 
ON public.licitacoes_anexos 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert anexos" 
ON public.licitacoes_anexos 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete anexos" 
ON public.licitacoes_anexos 
FOR DELETE 
TO authenticated
USING (true);

-- Index for faster lookups
CREATE INDEX idx_licitacoes_anexos_licitacao_id ON public.licitacoes_anexos(licitacao_id);