-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE public.tipo_contrato AS ENUM ('licitacao', 'privado');
CREATE TYPE public.status_contrato AS ENUM ('ativo', 'inativo', 'suspenso');
CREATE TYPE public.status_demanda AS ENUM ('aberta', 'em_atendimento', 'concluida', 'cancelada');
CREATE TYPE public.status_proposta AS ENUM ('pendente', 'aceita', 'recusada');
CREATE TYPE public.status_documentacao AS ENUM ('pendente', 'em_analise', 'aprovada', 'reprovada');
CREATE TYPE public.status_assinatura AS ENUM ('pendente', 'assinado', 'cancelado');
CREATE TYPE public.status_execucao AS ENUM ('pendente', 'executada', 'cancelada');
CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_demanda', 'recrutador', 'coordenador_escalas', 'financeiro', 'medico');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create clientes table
CREATE TABLE public.clientes (
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
CREATE TABLE public.contratos_demanda (
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
CREATE TABLE public.demandas (
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
CREATE TABLE public.medicos (
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
CREATE TABLE public.propostas_medicas (
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
CREATE TABLE public.contratos_medico (
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
CREATE TABLE public.escalas (
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
CREATE TABLE public.pagamentos_medico (
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
CREATE TABLE public.recebimentos_cliente (
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
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- RLS Policies for user_roles table
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin(auth.uid()));

-- RLS Policies for clientes table
CREATE POLICY "Authenticated users can view clientes"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and gestores can manage clientes"
  ON public.clientes FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

-- RLS Policies for contratos_demanda table
CREATE POLICY "Authenticated users can view contratos_demanda"
  ON public.contratos_demanda FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and gestores can manage contratos_demanda"
  ON public.contratos_demanda FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

-- RLS Policies for demandas table
CREATE POLICY "Authenticated users can view demandas"
  ON public.demandas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins, gestores and recrutadores can manage demandas"
  ON public.demandas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda') OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for medicos table
CREATE POLICY "Authenticated users can view medicos"
  ON public.medicos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and recrutadores can manage medicos"
  ON public.medicos FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for propostas_medicas table
CREATE POLICY "Authenticated users can view propostas_medicas"
  ON public.propostas_medicas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and recrutadores can manage propostas_medicas"
  ON public.propostas_medicas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for contratos_medico table
CREATE POLICY "Authenticated users can view contratos_medico"
  ON public.contratos_medico FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and recrutadores can manage contratos_medico"
  ON public.contratos_medico FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

-- RLS Policies for escalas table
CREATE POLICY "Authenticated users can view escalas"
  ON public.escalas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and coordenadores can manage escalas"
  ON public.escalas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'coordenador_escalas')
  );

-- RLS Policies for pagamentos_medico table
CREATE POLICY "Authenticated users can view pagamentos_medico"
  ON public.pagamentos_medico FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and financeiro can manage pagamentos_medico"
  ON public.pagamentos_medico FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'financeiro')
  );

-- RLS Policies for recebimentos_cliente table
CREATE POLICY "Authenticated users can view recebimentos_cliente"
  ON public.recebimentos_cliente FOR SELECT
  TO authenticated
  USING (true);

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
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contratos_demanda_updated_at
  BEFORE UPDATE ON public.contratos_demanda
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_demandas_updated_at
  BEFORE UPDATE ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medicos_updated_at
  BEFORE UPDATE ON public.medicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_propostas_medicas_updated_at
  BEFORE UPDATE ON public.propostas_medicas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contratos_medico_updated_at
  BEFORE UPDATE ON public.contratos_medico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_escalas_updated_at
  BEFORE UPDATE ON public.escalas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pagamentos_medico_updated_at
  BEFORE UPDATE ON public.pagamentos_medico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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