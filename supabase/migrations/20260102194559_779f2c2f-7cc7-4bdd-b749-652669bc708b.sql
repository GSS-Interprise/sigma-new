
-- Adicionar colunas faltantes na tabela ages_contratos
ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS assinado text DEFAULT 'Pendente',
ADD COLUMN IF NOT EXISTS motivo_pendente text,
ADD COLUMN IF NOT EXISTS prazo_meses integer,
ADD COLUMN IF NOT EXISTS codigo_interno integer;

-- Criar sequência para codigo_interno em ages_contratos
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;

-- Definir default para codigo_interno usando a sequência
ALTER TABLE public.ages_contratos 
ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq');

-- Criar tabela ages_contrato_itens
CREATE TABLE IF NOT EXISTS public.ages_contrato_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  item text NOT NULL,
  valor_item numeric NOT NULL,
  quantidade integer DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Criar tabela ages_contrato_renovacoes
CREATE TABLE IF NOT EXISTS public.ages_contrato_renovacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_vigencia date NOT NULL,
  percentual_reajuste numeric,
  valor numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Criar tabela ages_contrato_aditivos
CREATE TABLE IF NOT EXISTS public.ages_contrato_aditivos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  prazo_meses integer NOT NULL,
  data_termino date NOT NULL,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.ages_contrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_contrato_aditivos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para ages_contrato_itens
CREATE POLICY "Authenticated users can view ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_renovacoes
CREATE POLICY "Authenticated users can view ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_aditivos
CREATE POLICY "Authenticated users can view ages_contrato_aditivos" 
ON public.ages_contrato_aditivos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_contrato_aditivos" 
ON public.ages_contrato_aditivos 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Trigger para updated_at nas novas tabelas
CREATE OR REPLACE FUNCTION public.update_ages_contrato_related_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ages_contrato_itens_updated_at
BEFORE UPDATE ON public.ages_contrato_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

CREATE TRIGGER update_ages_contrato_renovacoes_updated_at
BEFORE UPDATE ON public.ages_contrato_renovacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

CREATE TRIGGER update_ages_contrato_aditivos_updated_at
BEFORE UPDATE ON public.ages_contrato_aditivos
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();
