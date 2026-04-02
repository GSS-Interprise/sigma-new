-- Adicionar novos campos à tabela licitacoes
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS licitacao_codigo TEXT,
ADD COLUMN IF NOT EXISTS municipio_uf TEXT,
ADD COLUMN IF NOT EXISTS modalidade TEXT,
ADD COLUMN IF NOT EXISTS data_disputa TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS etiquetas TEXT[],
ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'Manual',
ADD COLUMN IF NOT EXISTS effect_id TEXT,
ADD COLUMN IF NOT EXISTS titulo TEXT;

-- Criar índices para otimizar buscas e deduplicação
CREATE INDEX IF NOT EXISTS idx_licitacoes_codigo ON public.licitacoes(licitacao_codigo);
CREATE INDEX IF NOT EXISTS idx_licitacoes_effect_id ON public.licitacoes(effect_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fonte ON public.licitacoes(fonte);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_disputa ON public.licitacoes(data_disputa);

-- Criar tabela para logs de sincronização com Effect
CREATE TABLE IF NOT EXISTS public.effect_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  tipo TEXT NOT NULL, -- 'created', 'updated', 'ignored', 'error'
  licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  effect_id TEXT,
  licitacao_codigo TEXT,
  detalhes JSONB,
  erro TEXT,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_created_at ON public.effect_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_tipo ON public.effect_sync_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_effect_id ON public.effect_sync_logs(effect_id);

-- Habilitar RLS para effect_sync_logs
ALTER TABLE public.effect_sync_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para effect_sync_logs
CREATE POLICY "Authorized users can view effect_sync_logs"
ON public.effect_sync_logs
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "System can insert effect_sync_logs"
ON public.effect_sync_logs
FOR INSERT
WITH CHECK (true);

-- Criar bucket de storage para PDFs dos editais (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'editais-pdfs',
  'editais-pdfs',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para editais-pdfs
CREATE POLICY "Authenticated users can view editais PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'editais-pdfs');

CREATE POLICY "Authorized users can upload editais PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

CREATE POLICY "Authorized users can update editais PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

CREATE POLICY "Authorized users can delete editais PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

-- Adicionar trigger para updated_at em effect_sync_logs
CREATE TRIGGER update_effect_sync_logs_updated_at
BEFORE UPDATE ON public.effect_sync_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();