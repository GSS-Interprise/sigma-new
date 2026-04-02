-- =============================================
-- FASE 1: Tabelas para Clientes e Unidades AGES
-- =============================================

-- 1.1 Criar tabela ages_clientes
CREATE TABLE public.ages_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  nome_fantasia TEXT,
  razao_social TEXT,
  cnpj TEXT,
  endereco TEXT,
  uf TEXT,
  cidade TEXT,
  email_contato TEXT,
  telefone_contato TEXT,
  contato_principal TEXT,
  status_cliente TEXT NOT NULL DEFAULT 'Ativo',
  especialidade_cliente TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 1.2 Criar tabela ages_unidades
CREATE TABLE public.ages_unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.ages_clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 1.3 Adicionar novas colunas em ages_contratos para referenciar ages_clientes e ages_unidades
-- Primeiro, adicionar as novas colunas
ALTER TABLE public.ages_contratos 
  ADD COLUMN IF NOT EXISTS ages_cliente_id UUID REFERENCES public.ages_clientes(id),
  ADD COLUMN IF NOT EXISTS ages_unidade_id UUID REFERENCES public.ages_unidades(id);

-- 1.4 Habilitar RLS
ALTER TABLE public.ages_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_unidades ENABLE ROW LEVEL SECURITY;

-- 1.5 Políticas RLS para ages_clientes
CREATE POLICY "Authenticated users can view ages_clientes"
  ON public.ages_clientes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_clientes"
  ON public.ages_clientes
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_ages'::app_role)
  );

-- 1.6 Políticas RLS para ages_unidades
CREATE POLICY "Authenticated users can view ages_unidades"
  ON public.ages_unidades
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_unidades"
  ON public.ages_unidades
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_ages'::app_role)
  );

-- 1.7 Trigger para updated_at em ages_clientes
CREATE TRIGGER update_ages_clientes_updated_at
  BEFORE UPDATE ON public.ages_clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.8 Trigger para updated_at em ages_unidades
CREATE TRIGGER update_ages_unidades_updated_at
  BEFORE UPDATE ON public.ages_unidades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.9 Índices para performance
CREATE INDEX idx_ages_clientes_status ON public.ages_clientes(status_cliente);
CREATE INDEX idx_ages_clientes_uf ON public.ages_clientes(uf);
CREATE INDEX idx_ages_unidades_cliente ON public.ages_unidades(cliente_id);
CREATE INDEX idx_ages_contratos_ages_cliente ON public.ages_contratos(ages_cliente_id);
CREATE INDEX idx_ages_contratos_ages_unidade ON public.ages_contratos(ages_unidade_id);