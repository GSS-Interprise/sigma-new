-- Drop existing tables if they exist (from partial migration)
DROP TABLE IF EXISTS public.proposta CASCADE;
DROP TABLE IF EXISTS public.servico CASCADE;
DROP TABLE IF EXISTS public.contrato_capitacao CASCADE;

-- Create contrato_capitacao table
CREATE TABLE public.contrato_capitacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  setor TEXT NOT NULL DEFAULT 'captacao',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create servico table
CREATE TABLE public.servico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_capitacao_id UUID NOT NULL REFERENCES public.contrato_capitacao(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create proposta table (using TEXT for status instead of enum)
CREATE TABLE public.proposta (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  servico_id UUID NOT NULL REFERENCES public.servico(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  valor NUMERIC,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada')),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_contrato_capitacao_contrato_id ON public.contrato_capitacao(contrato_id);
CREATE INDEX idx_servico_contrato_capitacao_id ON public.servico(contrato_capitacao_id);
CREATE INDEX idx_proposta_servico_id ON public.proposta(servico_id);
CREATE INDEX idx_proposta_lead_id ON public.proposta(lead_id);

-- Enable RLS
ALTER TABLE public.contrato_capitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contrato_capitacao
CREATE POLICY "Usuários autorizados podem gerenciar contrato_capitacao"
ON public.contrato_capitacao FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

CREATE POLICY "Usuários autenticados podem visualizar contrato_capitacao"
ON public.contrato_capitacao FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for servico
CREATE POLICY "Usuários autorizados podem gerenciar servico"
ON public.servico FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

CREATE POLICY "Usuários autenticados podem visualizar servico"
ON public.servico FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for proposta
CREATE POLICY "Usuários autorizados podem gerenciar proposta"
ON public.proposta FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

CREATE POLICY "Usuários autenticados podem visualizar proposta"
ON public.proposta FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Triggers for updated_at
CREATE TRIGGER update_contrato_capitacao_updated_at
  BEFORE UPDATE ON public.contrato_capitacao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_servico_updated_at
  BEFORE UPDATE ON public.servico
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposta_updated_at
  BEFORE UPDATE ON public.proposta
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();