
-- ETAPA 1: Criar tabela contrato_rascunho (staging de contratos)
CREATE TABLE public.contrato_rascunho (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'consolidado', 'cancelado')),
  overlay_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  consolidado_em TIMESTAMP WITH TIME ZONE,
  consolidado_por UUID REFERENCES auth.users(id)
);

-- Índices para performance
CREATE INDEX idx_contrato_rascunho_licitacao ON public.contrato_rascunho(licitacao_id);
CREATE INDEX idx_contrato_rascunho_status ON public.contrato_rascunho(status);
CREATE INDEX idx_contrato_rascunho_contrato ON public.contrato_rascunho(contrato_id);

-- Trigger para updated_at
CREATE TRIGGER update_contrato_rascunho_updated_at
  BEFORE UPDATE ON public.contrato_rascunho
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de anexos do rascunho
CREATE TABLE public.contrato_rascunho_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_rascunho_id UUID NOT NULL REFERENCES public.contrato_rascunho(id) ON DELETE CASCADE,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_path TEXT,
  mime_type TEXT,
  origem TEXT NOT NULL DEFAULT 'licitacao_card',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_contrato_rascunho_anexos_rascunho ON public.contrato_rascunho_anexos(contrato_rascunho_id);

-- Adicionar coluna licitacao_origem_id na tabela contratos (aditivo)
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS licitacao_origem_id UUID REFERENCES public.licitacoes(id);
CREATE INDEX IF NOT EXISTS idx_contratos_licitacao_origem ON public.contratos(licitacao_origem_id);

-- RLS para contrato_rascunho
ALTER TABLE public.contrato_rascunho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar rascunhos"
  ON public.contrato_rascunho FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem gerenciar rascunhos"
  ON public.contrato_rascunho FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'lideres'));

-- RLS para contrato_rascunho_anexos
ALTER TABLE public.contrato_rascunho_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem visualizar anexos de rascunho"
  ON public.contrato_rascunho_anexos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem gerenciar anexos de rascunho"
  ON public.contrato_rascunho_anexos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'lideres'));
