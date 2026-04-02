-- Criar bucket de storage para documentos dos médicos
INSERT INTO storage.buckets (id, name, public)
VALUES ('medicos-documentos', 'medicos-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para documentos dos médicos
CREATE POLICY "Usuários autenticados podem ver documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'medicos-documentos');

CREATE POLICY "Usuários autorizados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

CREATE POLICY "Usuários autorizados podem atualizar documentos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

CREATE POLICY "Usuários autorizados podem deletar documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

-- Tipos de documento
CREATE TYPE tipo_documento_medico AS ENUM (
  'diploma',
  'certificado',
  'rg',
  'cpf',
  'crm',
  'rqe',
  'titulo_especialista',
  'comprovante_residencia',
  'certidao',
  'carta_recomendacao',
  'outro'
);

-- Tabela de documentos dos médicos
CREATE TABLE public.medico_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  arquivo_path TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  tipo_documento tipo_documento_medico NOT NULL,
  emissor TEXT,
  data_emissao DATE,
  data_validade DATE,
  observacoes TEXT,
  texto_extraido TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_documentos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para documentos
CREATE POLICY "Usuários autenticados podem ver documentos"
ON public.medico_documentos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autorizados podem inserir documentos"
ON public.medico_documentos FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

CREATE POLICY "Usuários autorizados podem atualizar documentos"
ON public.medico_documentos FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

CREATE POLICY "Usuários autorizados podem deletar documentos"
ON public.medico_documentos FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Tabela de logs de auditoria de documentos
CREATE TABLE public.medico_documentos_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES public.medico_documentos(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL, -- 'upload', 'download', 'update', 'delete', 'view'
  detalhes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_documentos_log ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para logs
CREATE POLICY "Usuários autenticados podem ver logs"
ON public.medico_documentos_log FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Sistema pode inserir logs"
ON public.medico_documentos_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

-- Adicionar coluna para resumo IA no médico
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS resumo_ia TEXT,
ADD COLUMN IF NOT EXISTS resumo_ia_gerado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resumo_ia_gerado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado_em TIMESTAMPTZ;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_medico_documentos_updated_at
  BEFORE UPDATE ON public.medico_documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_medico_documentos_medico_id ON public.medico_documentos(medico_id);
CREATE INDEX idx_medico_documentos_tipo ON public.medico_documentos(tipo_documento);
CREATE INDEX idx_medico_documentos_validade ON public.medico_documentos(data_validade);
CREATE INDEX idx_medico_documentos_log_medico_id ON public.medico_documentos_log(medico_id);
CREATE INDEX idx_medico_documentos_log_documento_id ON public.medico_documentos_log(documento_id);