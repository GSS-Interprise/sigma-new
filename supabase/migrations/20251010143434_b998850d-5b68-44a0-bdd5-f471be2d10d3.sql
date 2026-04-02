-- Adicionar novos campos na tabela clientes
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS email_financeiro TEXT,
  ADD COLUMN IF NOT EXISTS telefone_financeiro TEXT,
  ADD COLUMN IF NOT EXISTS nome_unidade TEXT;

-- Adicionar novos campos na tabela contratos
ALTER TABLE public.contratos 
  ADD COLUMN IF NOT EXISTS codigo_interno INTEGER,
  ADD COLUMN IF NOT EXISTS objeto_contrato TEXT,
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT[];

-- Alterar o enum de status_assinatura_contrato
ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Em Análise';
ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Aguardando Retorno';

-- Criar tabela para itens do contrato
CREATE TABLE IF NOT EXISTS public.contrato_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  item TEXT NOT NULL,
  valor_item NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela para renovações de contrato
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5, 2),
  valor NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela para histórico de anexos
CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contrato_itens
CREATE POLICY "Authorized users can manage contrato_itens"
ON public.contrato_itens
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- RLS Policies for contrato_renovacoes
CREATE POLICY "Authorized users can manage contrato_renovacoes"
ON public.contrato_renovacoes
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- RLS Policies for contrato_anexos
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos
FOR SELECT
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

CREATE POLICY "Authorized users can insert contrato_anexos"
ON public.contrato_anexos
FOR INSERT
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- Triggers para updated_at
CREATE OR REPLACE TRIGGER update_contrato_itens_updated_at
BEFORE UPDATE ON public.contrato_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_contrato_renovacoes_updated_at
BEFORE UPDATE ON public.contrato_renovacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();