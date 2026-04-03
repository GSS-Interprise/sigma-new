-- === 20251002172058_9c3d2271-2c53-4fd8-aa22-838a3888edaa.sql ===
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
DO $tw$ BEGIN CREATE TYPE public.tipo_contrato AS ENUM ('licitacao', 'privado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_contrato AS ENUM ('ativo', 'inativo', 'suspenso'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_demanda AS ENUM ('aberta', 'em_atendimento', 'concluida', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_proposta AS ENUM ('pendente', 'aceita', 'recusada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_documentacao AS ENUM ('pendente', 'em_analise', 'aprovada', 'reprovada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_assinatura AS ENUM ('pendente', 'assinado', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_execucao AS ENUM ('pendente', 'executada', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;

DO $tw$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_demanda', 'recrutador', 'coordenador_escalas', 'financeiro', 'medico'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create clientes table
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_empresa TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  contato_principal TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create contratos_demanda table
CREATE TABLE IF NOT EXISTS public.contratos_demanda (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero_contrato TEXT NOT NULL UNIQUE,
  tipo_contrato tipo_contrato NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  status status_contrato NOT NULL DEFAULT 'ativo',
  documento_url TEXT,
  valor_total DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create demandas table
CREATE TABLE IF NOT EXISTS public.demandas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_demanda_id UUID NOT NULL REFERENCES public.contratos_demanda(id) ON DELETE CASCADE,
  especialidade_medica TEXT NOT NULL,
  quantidade_medicos INTEGER NOT NULL DEFAULT 1,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE,
  local_atuacao TEXT NOT NULL,
  status status_demanda NOT NULL DEFAULT 'aberta',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create medicos table
CREATE TABLE IF NOT EXISTS public.medicos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_completo TEXT NOT NULL,
  crm TEXT NOT NULL UNIQUE,
  especialidade TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  documentos_url TEXT[],
  status_documentacao status_documentacao NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create propostas_medicas table
CREATE TABLE IF NOT EXISTS public.propostas_medicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data_envio TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status_proposta status_proposta NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create contratos_medico table
CREATE TABLE IF NOT EXISTS public.contratos_medico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  numero_contrato TEXT NOT NULL UNIQUE,
  data_assinatura DATE,
  status_assinatura status_assinatura NOT NULL DEFAULT 'pendente',
  documento_url TEXT,
  valor_hora DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create escalas table
CREATE TABLE IF NOT EXISTS public.escalas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_medico_id UUID NOT NULL REFERENCES public.contratos_medico(id) ON DELETE CASCADE,
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  data_escala DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  status_execucao status_execucao NOT NULL DEFAULT 'pendente',
  valor_pagamento DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create pagamentos_medico table
CREATE TABLE IF NOT EXISTS public.pagamentos_medico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escala_id UUID NOT NULL REFERENCES public.escalas(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  valor DECIMAL(10, 2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status_pagamento status_pagamento NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create recebimentos_cliente table
CREATE TABLE IF NOT EXISTS public.recebimentos_cliente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_demanda_id UUID NOT NULL REFERENCES public.contratos_demanda(id) ON DELETE CASCADE,
  valor DECIMAL(12, 2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_recebimento DATE,
  status_recebimento status_pagamento NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_demanda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_medicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_medico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_medico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos_cliente ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- RLS Policies for profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- RLS Policies for user_roles table
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin(auth.uid()));

-- RLS Policies for clientes table
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;
CREATE POLICY "Authenticated users can view clientes"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
CREATE POLICY "Admins and gestores can manage clientes"
  ON public.clientes FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

-- RLS Policies for contratos_demanda table
DROP POLICY IF EXISTS "Authenticated users can view contratos_demanda" ON public.contratos_demanda;
CREATE POLICY "Authenticated users can view contratos_demanda"
  ON public.contratos_demanda FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and gestores can manage contratos_demanda" ON public.contratos_demanda;
CREATE POLICY "Admins and gestores can manage contratos_demanda"
  ON public.contratos_demanda FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

-- RLS Policies for demandas table
DROP POLICY IF EXISTS "Authenticated users can view demandas" ON public.demandas;
CREATE POLICY "Authenticated users can view demandas"
  ON public.demandas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins, gestores and recrutadores can manage demandas" ON public.demandas;
CREATE POLICY "Admins, gestores and recrutadores can manage demandas"
  ON public.demandas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda') OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for medicos table
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
CREATE POLICY "Authenticated users can view medicos"
  ON public.medicos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
CREATE POLICY "Admins and recrutadores can manage medicos"
  ON public.medicos FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for propostas_medicas table
DROP POLICY IF EXISTS "Authenticated users can view propostas_medicas" ON public.propostas_medicas;
CREATE POLICY "Authenticated users can view propostas_medicas"
  ON public.propostas_medicas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and recrutadores can manage propostas_medicas" ON public.propostas_medicas;
CREATE POLICY "Admins and recrutadores can manage propostas_medicas"
  ON public.propostas_medicas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for contratos_medico table
DROP POLICY IF EXISTS "Authenticated users can view contratos_medico" ON public.contratos_medico;
CREATE POLICY "Authenticated users can view contratos_medico"
  ON public.contratos_medico FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and recrutadores can manage contratos_medico" ON public.contratos_medico;
CREATE POLICY "Admins and recrutadores can manage contratos_medico"
  ON public.contratos_medico FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for escalas table
DROP POLICY IF EXISTS "Authenticated users can view escalas" ON public.escalas;
CREATE POLICY "Authenticated users can view escalas"
  ON public.escalas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and coordenadores can manage escalas" ON public.escalas;
CREATE POLICY "Admins and coordenadores can manage escalas"
  ON public.escalas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'coordenador_escalas')
  );

-- RLS Policies for pagamentos_medico table
DROP POLICY IF EXISTS "Authenticated users can view pagamentos_medico" ON public.pagamentos_medico;
CREATE POLICY "Authenticated users can view pagamentos_medico"
  ON public.pagamentos_medico FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and financeiro can manage pagamentos_medico" ON public.pagamentos_medico;
CREATE POLICY "Admins and financeiro can manage pagamentos_medico"
  ON public.pagamentos_medico FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'financeiro')
  );

-- RLS Policies for recebimentos_cliente table
DROP POLICY IF EXISTS "Authenticated users can view recebimentos_cliente" ON public.recebimentos_cliente;
CREATE POLICY "Authenticated users can view recebimentos_cliente"
  ON public.recebimentos_cliente FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and financeiro can manage recebimentos_cliente" ON public.recebimentos_cliente;
CREATE POLICY "Admins and financeiro can manage recebimentos_cliente"
  ON public.recebimentos_cliente FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'financeiro')
  );

-- Create trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at on all relevant tables
DROP TRIGGER IF EXISTS "update_profiles_updated_at" ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_clientes_updated_at" ON public.clientes;
CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_contratos_demanda_updated_at" ON public.contratos_demanda;
CREATE TRIGGER update_contratos_demanda_updated_at
  BEFORE UPDATE ON public.contratos_demanda
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_demandas_updated_at" ON public.demandas;
CREATE TRIGGER update_demandas_updated_at
  BEFORE UPDATE ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_medicos_updated_at" ON public.medicos;
CREATE TRIGGER update_medicos_updated_at
  BEFORE UPDATE ON public.medicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_propostas_medicas_updated_at" ON public.propostas_medicas;
CREATE TRIGGER update_propostas_medicas_updated_at
  BEFORE UPDATE ON public.propostas_medicas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_contratos_medico_updated_at" ON public.contratos_medico;
CREATE TRIGGER update_contratos_medico_updated_at
  BEFORE UPDATE ON public.contratos_medico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_escalas_updated_at" ON public.escalas;
CREATE TRIGGER update_escalas_updated_at
  BEFORE UPDATE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_pagamentos_medico_updated_at" ON public.pagamentos_medico;
CREATE TRIGGER update_pagamentos_medico_updated_at
  BEFORE UPDATE ON public.pagamentos_medico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_recebimentos_cliente_updated_at" ON public.recebimentos_cliente;
CREATE TRIGGER update_recebimentos_cliente_updated_at
  BEFORE UPDATE ON public.recebimentos_cliente
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome_completo, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', 'Usuário'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- === 20251003115845_95f1cd2c-b79b-4cc8-b681-f755aafaa577.sql ===
-- Ajustar políticas RLS da tabela medicos para permitir inserção por usuários autenticados
-- Remove as políticas antigas
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;

-- Cria novas políticas mais permissivas para desenvolvimento
DROP POLICY IF EXISTS "Authenticated users can insert medicos" ON public.medicos;
CREATE POLICY "Authenticated users can insert medicos"
ON public.medicos
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
CREATE POLICY "Authenticated users can view medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can update medicos" ON public.medicos;
CREATE POLICY "Authenticated users can update medicos"
ON public.medicos
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete medicos" ON public.medicos;
CREATE POLICY "Authenticated users can delete medicos"
ON public.medicos
FOR DELETE
TO authenticated
USING (true);

-- === 20251003160017_3b089b59-1103-44cd-a9be-c78bdd201144.sql ===
-- Criar enum para status de cliente
DO $tw$ BEGIN CREATE TYPE status_cliente AS ENUM ('Ativo', 'Inativo', 'Suspenso', 'Cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar enum para especialidade de cliente
DO $tw$ BEGIN CREATE TYPE especialidade_cliente AS ENUM ('Hospital', 'Clínica', 'UBS', 'Outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar enum para status de médico
DO $tw$ BEGIN CREATE TYPE status_medico AS ENUM ('Ativo', 'Inativo', 'Suspenso'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar enum para tipo de demanda do relacionamento médico
DO $tw$ BEGIN CREATE TYPE tipo_relacionamento AS ENUM ('Reclamação', 'Feedback Positivo', 'Alinhamento Escalas', 'Ação Comemorativa'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar enum para status de assinatura de contrato
DO $tw$ BEGIN CREATE TYPE status_assinatura_contrato AS ENUM ('Sim', 'Pendente'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Atualizar tabela de clientes
ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS nome_fantasia TEXT,
  ADD COLUMN IF NOT EXISTS razao_social TEXT,
  ADD COLUMN IF NOT EXISTS status_cliente status_cliente DEFAULT 'Ativo',
  ADD COLUMN IF NOT EXISTS especialidade_cliente especialidade_cliente;

-- Atualizar colunas existentes para se alinharem ao novo modelo
UPDATE public.clientes SET nome_fantasia = nome_empresa WHERE nome_fantasia IS NULL;
UPDATE public.clientes SET razao_social = nome_empresa WHERE razao_social IS NULL;

-- Adicionar coluna cliente_vinculado à tabela de médicos
ALTER TABLE public.medicos 
  ADD COLUMN IF NOT EXISTS cliente_vinculado_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_medico status_medico DEFAULT 'Ativo';

-- Criar tabela de relacionamento médico (substitui demandas)
CREATE TABLE IF NOT EXISTS public.relacionamento_medico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_relacionamento NOT NULL,
  descricao TEXT NOT NULL,
  cliente_vinculado_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  medico_vinculado_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela de contratos (substitui escalas)
CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  medico_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  assinado status_assinatura_contrato NOT NULL DEFAULT 'Pendente',
  motivo_pendente TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT check_cliente_ou_medico CHECK (
    (cliente_id IS NOT NULL AND medico_id IS NULL) OR
    (cliente_id IS NULL AND medico_id IS NOT NULL)
  )
);

-- Criar tabela para itens customizáveis de listas
CREATE TABLE IF NOT EXISTS public.config_lista_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campo_nome TEXT NOT NULL,
  valor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(campo_nome, valor)
);

-- Criar tabela para histórico de acessos
CREATE TABLE IF NOT EXISTS public.historico_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela para controle de permissões por menu
CREATE TABLE IF NOT EXISTS public.menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  menu_item TEXT NOT NULL,
  can_access BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role, menu_item)
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.relacionamento_medico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_lista_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para relacionamento_medico
DROP POLICY IF EXISTS "Authenticated users can view relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authenticated users can view relacionamento_medico"
ON public.relacionamento_medico FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authenticated users can insert relacionamento_medico"
ON public.relacionamento_medico FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authenticated users can update relacionamento_medico"
ON public.relacionamento_medico FOR UPDATE
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authenticated users can delete relacionamento_medico"
ON public.relacionamento_medico FOR DELETE
TO authenticated USING (true);

-- Políticas RLS para contratos
DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;
CREATE POLICY "Authenticated users can view contratos"
ON public.contratos FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert contratos" ON public.contratos;
CREATE POLICY "Authenticated users can insert contratos"
ON public.contratos FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update contratos" ON public.contratos;
CREATE POLICY "Authenticated users can update contratos"
ON public.contratos FOR UPDATE
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete contratos" ON public.contratos;
CREATE POLICY "Authenticated users can delete contratos"
ON public.contratos FOR DELETE
TO authenticated USING (true);

-- Políticas RLS para config_lista_items
DROP POLICY IF EXISTS "Authenticated users can view config_lista_items" ON public.config_lista_items;
CREATE POLICY "Authenticated users can view config_lista_items"
ON public.config_lista_items FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage config_lista_items" ON public.config_lista_items;
CREATE POLICY "Admins can manage config_lista_items"
ON public.config_lista_items FOR ALL
TO authenticated USING (is_admin(auth.uid()));

-- Políticas RLS para historico_acessos
DROP POLICY IF EXISTS "Admins can view all historico_acessos" ON public.historico_acessos;
CREATE POLICY "Admins can view all historico_acessos"
ON public.historico_acessos FOR SELECT
TO authenticated USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own historico_acessos" ON public.historico_acessos;
CREATE POLICY "Users can insert their own historico_acessos"
ON public.historico_acessos FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

-- Políticas RLS para menu_permissions
DROP POLICY IF EXISTS "Authenticated users can view menu_permissions" ON public.menu_permissions;
CREATE POLICY "Authenticated users can view menu_permissions"
ON public.menu_permissions FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage menu_permissions" ON public.menu_permissions;
CREATE POLICY "Admins can manage menu_permissions"
ON public.menu_permissions FOR ALL
TO authenticated USING (is_admin(auth.uid()));

-- Trigger para atualizar updated_at em relacionamento_medico
DROP TRIGGER IF EXISTS "update_relacionamento_medico_updated_at" ON public.relacionamento_medico;
CREATE TRIGGER update_relacionamento_medico_updated_at
BEFORE UPDATE ON public.relacionamento_medico
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para atualizar updated_at em contratos
DROP TRIGGER IF EXISTS "update_contratos_updated_at" ON public.contratos;
CREATE TRIGGER update_contratos_updated_at
BEFORE UPDATE ON public.contratos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251003162323_355a09fc-d958-4ec0-99db-7b89da24882b.sql ===
-- Atualizar políticas RLS da tabela clientes para permitir operações de usuários autenticados
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;

-- Permitir que todos os usuários autenticados gerenciem clientes
DROP POLICY IF EXISTS "Authenticated users can manage clientes" ON public.clientes;
CREATE POLICY "Authenticated users can manage clientes"
ON public.clientes
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- === 20251003163501_da8cf1a9-c905-443c-9254-c8aa93a6021b.sql ===
-- Fix overly permissive RLS policies to implement proper role-based access control
-- This addresses the critical PUBLIC_DATA_EXPOSURE security finding

-- ============================================
-- 1. CLIENTES TABLE - Client Management
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;

-- Admins and gestores can fully manage clients
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
CREATE POLICY "Admins and gestores can manage clientes"
ON public.clientes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
);

-- Recrutadores can view clients (read-only)
DROP POLICY IF EXISTS "Recrutadores can view clientes" ON public.clientes;
CREATE POLICY "Recrutadores can view clientes"
ON public.clientes
FOR SELECT
USING (has_role(auth.uid(), 'recrutador'::app_role));

-- ============================================
-- 2. MEDICOS TABLE - Doctor Management
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can insert medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can update medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can delete medicos" ON public.medicos;

-- Admins and recrutadores can fully manage doctors
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
CREATE POLICY "Admins and recrutadores can manage medicos"
ON public.medicos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- Coordenadores de escalas can view doctors
DROP POLICY IF EXISTS "Coordenadores can view medicos" ON public.medicos;
CREATE POLICY "Coordenadores can view medicos"
ON public.medicos
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'::app_role));

-- ============================================
-- 3. CONTRATOS TABLE - Basic Contracts
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can insert contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can update contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can delete contratos" ON public.contratos;

-- Admins, gestores, and recrutadores can manage contracts
DROP POLICY IF EXISTS "Authorized users can manage contratos" ON public.contratos;
CREATE POLICY "Authorized users can manage contratos"
ON public.contratos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- ============================================
-- 4. RELACIONAMENTO_MEDICO TABLE
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can insert relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can update relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can delete relacionamento_medico" ON public.relacionamento_medico;

-- Admins, gestores, and recrutadores can manage doctor relationships
DROP POLICY IF EXISTS "Authorized users can manage relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authorized users can manage relacionamento_medico"
ON public.relacionamento_medico
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- ============================================
-- 5. Fix search_path on existing functions
-- ============================================
-- Update handle_new_user function with fixed search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome_completo, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', 'Usuário'),
    NEW.email
  );
  RETURN NEW;
END;
$function$;

-- === 20251003163524_8666eb40-1c34-4957-b765-36f5fb113ffe.sql ===
-- Fix search_path for update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- === 20251003172757_484cb785-3835-4130-99bc-36bf6c12d1d2.sql ===
-- Adicionar campo estado na tabela medicos
ALTER TABLE public.medicos 
ADD COLUMN IF NOT EXISTS estado text;

-- Criar tabela para log de disparos
CREATE TABLE IF NOT EXISTS public.disparos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  usuario_id uuid REFERENCES auth.users(id) NOT NULL,
  usuario_nome text NOT NULL,
  especialidade text NOT NULL,
  estado text,
  mensagem text NOT NULL,
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  detalhes_falhas jsonb,
  revisado_ia boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.disparos_log ENABLE ROW LEVEL SECURITY;

-- Policy: usuários autenticados podem ver seus próprios logs
DROP POLICY IF EXISTS "Users can view their own disparos_log" ON public.disparos_log;
CREATE POLICY "Users can view their own disparos_log"
ON public.disparos_log
FOR SELECT
TO authenticated
USING (auth.uid() = usuario_id);

-- Policy: usuários autenticados podem inserir seus próprios logs
DROP POLICY IF EXISTS "Users can insert their own disparos_log" ON public.disparos_log;
CREATE POLICY "Users can insert their own disparos_log"
ON public.disparos_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

-- Policy: admins podem ver todos os logs
DROP POLICY IF EXISTS "Admins can view all disparos_log" ON public.disparos_log;
CREATE POLICY "Admins can view all disparos_log"
ON public.disparos_log
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_disparos_log_usuario ON public.disparos_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_disparos_log_created ON public.disparos_log(created_at DESC);

-- === 20251003173016_e5632b27-9a30-44bc-bc87-507f642518a5.sql ===
-- Adicionar coluna para armazenar destinatários no log de disparos
ALTER TABLE public.disparos_log 
ADD COLUMN IF NOT EXISTS destinatarios jsonb;

-- === 20251003185639_d60539a7-96c7-403c-9e5b-36dd4abef58d.sql ===
-- Add tipo_principal column to relacionamento_medico table
ALTER TABLE relacionamento_medico 
ADD COLUMN IF NOT EXISTS tipo_principal text NOT NULL DEFAULT 'Ação';

-- Update the tipo enum to include all new subtypes
DO $altc$ BEGIN ALTER TABLE relacionamento_medico 
ALTER COLUMN tipo TYPE text; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- Add check constraint for tipo_principal
DO $ac$ BEGIN ALTER TABLE relacionamento_medico
ADD CONSTRAINT check_tipo_principal 
CHECK (tipo_principal IN ('Reclamação', 'Ação')); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;

COMMENT ON COLUMN relacionamento_medico.tipo_principal IS 'Tipo principal: Reclamação ou Ação';
COMMENT ON COLUMN relacionamento_medico.tipo IS 'Subtipo específico baseado no tipo_principal';

-- === 20251003190407_309e815d-c06e-44dd-99a9-23199d24903d.sql ===
-- Add status column to relacionamento_medico table
ALTER TABLE relacionamento_medico 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberta';

-- Add check constraint for status
DO $ac$ BEGIN ALTER TABLE relacionamento_medico
ADD CONSTRAINT check_status 
CHECK (status IN ('aberta', 'em_analise', 'concluida')); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;

-- === 20251003193846_4ec7f27c-5a2c-4295-9ad7-911c57bf6e52.sql ===
-- Create enum for user status
DO $tw$ BEGIN CREATE TYPE user_status AS ENUM ('ativo', 'inativo', 'suspenso'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Add status column to profiles table
DO $acol$ BEGIN ALTER TABLE public.profiles 
ADD COLUMN status user_status NOT NULL DEFAULT 'ativo'; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- === 20251004183935_9ca6668f-1f69-45dc-a35c-197537c730ef.sql ===
-- Adicionar campo gravidade na tabela relacionamento_medico
DO $acol$ BEGIN ALTER TABLE public.relacionamento_medico
ADD COLUMN gravidade text CHECK (gravidade IN ('baixa', 'media', 'alta', 'critica')); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Adicionar campo data_nascimento na tabela medicos para aniversários
DO $acol$ BEGIN ALTER TABLE public.medicos
ADD COLUMN data_nascimento date; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_relacionamento_status ON public.relacionamento_medico(status);
CREATE INDEX IF NOT EXISTS idx_relacionamento_tipo ON public.relacionamento_medico(tipo_principal);
CREATE INDEX IF NOT EXISTS idx_medicos_data_nascimento ON public.medicos(data_nascimento);

-- === 20251004184558_edaefc3b-c94f-4021-9883-109995992008.sql ===
-- Adicionar campo CPF na tabela medicos
DO $acol$ BEGIN ALTER TABLE public.medicos
ADD COLUMN cpf text UNIQUE; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

COMMENT ON COLUMN public.medicos.cpf IS 'CPF do médico (11 dígitos, apenas números)';

-- Criar índice para CPF
CREATE INDEX IF NOT EXISTS idx_medicos_cpf ON public.medicos(cpf);

-- === 20251004190434_010bf4d4-948c-420b-9e3f-00265b5b9b87.sql ===
-- Adicionar campo codigo_contrato na tabela contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS codigo_contrato TEXT;

-- === 20251004193143_4fa7657e-f4bf-48e5-a0bd-f5500a103f7b.sql ===
-- Criar bucket para documentos de contratos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contratos-documentos',
  'contratos-documentos',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Políticas RLS para o bucket de contratos
-- Usuários autorizados podem fazer upload
DROP POLICY IF EXISTS "Authorized users can upload contract documents" ON storage.objects;
CREATE POLICY "Authorized users can upload contract documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem visualizar documentos
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
CREATE POLICY "Authorized users can view contract documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem atualizar documentos
DROP POLICY IF EXISTS "Authorized users can update contract documents" ON storage.objects;
CREATE POLICY "Authorized users can update contract documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem deletar documentos
DROP POLICY IF EXISTS "Authorized users can delete contract documents" ON storage.objects;
CREATE POLICY "Authorized users can delete contract documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Adicionar coluna documento_url na tabela contratos
DO $acol$ BEGIN ALTER TABLE contratos ADD COLUMN documento_url text; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- === 20251009141239_5c33710f-ec4f-4c21-af74-7507204799e8.sql ===
-- Criar tabela de chips disponíveis
CREATE TABLE IF NOT EXISTS public.chips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nome text NOT NULL,
  numero text NOT NULL UNIQUE,
  provedor text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'manutencao')),
  limite_diario integer DEFAULT 1000
);

-- Criar tabela de black list
CREATE TABLE IF NOT EXISTS public.black_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  medico_id uuid REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo text,
  adicionado_por uuid REFERENCES auth.users(id)
);

-- Criar tabela de disparos programados
CREATE TABLE IF NOT EXISTS public.disparos_programados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id),
  chip_id uuid REFERENCES public.chips(id),
  especialidade text NOT NULL,
  estado text,
  mensagem text NOT NULL,
  data_agendamento timestamptz NOT NULL,
  tamanho_lote integer DEFAULT 500,
  status text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'em_envio', 'enviado', 'erro', 'respondido', 'cancelado')),
  total_destinatarios integer DEFAULT 0,
  enviados integer DEFAULT 0,
  falhas integer DEFAULT 0,
  destinatarios_enviados jsonb DEFAULT '[]'::jsonb,
  detalhes_erro text
);

-- Atualizar disparos_log para incluir chip
ALTER TABLE public.disparos_log 
ADD COLUMN IF NOT EXISTS chip_id uuid REFERENCES public.chips(id),
ADD COLUMN IF NOT EXISTS disparo_programado_id uuid REFERENCES public.disparos_programados(id);

-- Habilitar RLS
ALTER TABLE public.chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.black_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_programados ENABLE ROW LEVEL SECURITY;

-- Políticas para chips
DROP POLICY IF EXISTS "Authenticated users can view chips" ON public.chips;
CREATE POLICY "Authenticated users can view chips"
ON public.chips FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage chips" ON public.chips;
CREATE POLICY "Admins can manage chips"
ON public.chips FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

-- Políticas para black_list
DROP POLICY IF EXISTS "Authenticated users can view black_list" ON public.black_list;
CREATE POLICY "Authenticated users can view black_list"
ON public.black_list FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authorized users can manage black_list" ON public.black_list;
CREATE POLICY "Authorized users can manage black_list"
ON public.black_list FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
);

-- Políticas para disparos_programados
DROP POLICY IF EXISTS "Users can view their own disparos_programados" ON public.disparos_programados;
CREATE POLICY "Users can view their own disparos_programados"
ON public.disparos_programados FOR SELECT
TO authenticated
USING (auth.uid() = usuario_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own disparos_programados" ON public.disparos_programados;
CREATE POLICY "Users can insert their own disparos_programados"
ON public.disparos_programados FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users can update their own disparos_programados" ON public.disparos_programados;
CREATE POLICY "Users can update their own disparos_programados"
ON public.disparos_programados FOR UPDATE
TO authenticated
USING (auth.uid() = usuario_id OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete disparos_programados" ON public.disparos_programados;
CREATE POLICY "Admins can delete disparos_programados"
ON public.disparos_programados FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER update_disparos_programados_updated_at
BEFORE UPDATE ON public.disparos_programados
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir alguns chips de exemplo
INSERT INTO public.chips (nome, numero, provedor, status, limite_diario)
VALUES 
  ('Chip 1 - Principal', '+5511999999001', 'Vivo', 'ativo', 1000),
  ('Chip 2 - Backup', '+5511999999002', 'TIM', 'ativo', 1000),
  ('Chip 3 - Marketing', '+5511999999003', 'Claro', 'ativo', 500)
ON CONFLICT (numero) DO NOTHING;

-- === 20251009150011_c6e8d9c6-f28f-4217-981a-22bf8e324db3.sql ===
-- Criar tabela de leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  phone_e164 text UNIQUE NOT NULL,
  especialidade text,
  uf text,
  origem text, -- 'excel', 'manual', 'campanha'
  status text NOT NULL DEFAULT 'Novo' CHECK (status IN ('Novo', 'Qualificado', 'Convertido', 'Descartado')),
  tags text[],
  observacoes text,
  arquivo_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Adicionar campos à tabela medicos
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS phone_e164 text UNIQUE,
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS alocado_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_contrato text;

-- Atualizar tabela blacklist (recriar com estrutura correta)
DROP TABLE IF EXISTS public.black_list CASCADE;

CREATE TABLE IF NOT EXISTS public.blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE NOT NULL,
  nome text,
  origem text, -- 'lead' ou 'clinico'
  reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Policies para leads
DROP POLICY IF EXISTS "Admins and recrutadores can manage leads" ON public.leads;
CREATE POLICY "Admins and recrutadores can manage leads"
ON public.leads
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'recrutador'));

DROP POLICY IF EXISTS "Coordenadores can view leads" ON public.leads;
CREATE POLICY "Coordenadores can view leads"
ON public.leads
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'));

-- Policies para blacklist
DROP POLICY IF EXISTS "Authenticated users can view blacklist" ON public.blacklist;
CREATE POLICY "Authenticated users can view blacklist"
ON public.blacklist
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;
CREATE POLICY "Authorized users can manage blacklist"
ON public.blacklist
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'recrutador') OR has_role(auth.uid(), 'gestor_demanda'));

-- Trigger para updated_at em leads
DROP TRIGGER IF EXISTS "update_leads_updated_at" ON public.leads;
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251009172428_a60bff5a-79a3-4e73-bec2-d8c7f82b56b4.sql ===
-- Adicionar campos necessários na tabela contratos
ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS status_contrato text CHECK (status_contrato IN ('Ativo','Inativo','Suspenso','Cancelado')) DEFAULT 'Ativo',
ADD COLUMN IF NOT EXISTS especialidade_contrato text CHECK (especialidade_contrato IN ('Hospital','Clínica','Pessoa Física','Pessoa Jurídica'));

-- Renomear campos na tabela clientes para padronizar
ALTER TABLE clientes 
RENAME COLUMN email TO email_contato;

ALTER TABLE clientes 
RENAME COLUMN telefone TO telefone_contato;

-- Criar índice composto para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_contratos_cliente_status_esp 
ON contratos (cliente_id, status_contrato, especialidade_contrato);

-- Criar índice único no CNPJ se ainda não existir
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cnpj 
ON clientes (cnpj);

-- === 20251009182246_6e081749-5bd3-4664-95a5-db82a1eed226.sql ===
-- Drop existing policies for clientes
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Recrutadores can view clientes" ON public.clientes;

-- Create new policy allowing admins, gestores AND recrutadores to manage clientes
DROP POLICY IF EXISTS "Authorized users can manage clientes" ON public.clientes;
CREATE POLICY "Authorized users can manage clientes" 
ON public.clientes 
FOR ALL 
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_demanda'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_demanda'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
);

-- === 20251010143434_b998850d-5b68-44a0-bdd5-f471be2d10d3.sql ===
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