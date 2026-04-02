-- Criar enum para status de cliente
CREATE TYPE status_cliente AS ENUM ('Ativo', 'Inativo', 'Suspenso', 'Cancelado');

-- Criar enum para especialidade de cliente
CREATE TYPE especialidade_cliente AS ENUM ('Hospital', 'Clínica', 'UBS', 'Outros');

-- Criar enum para status de médico
CREATE TYPE status_medico AS ENUM ('Ativo', 'Inativo', 'Suspenso');

-- Criar enum para tipo de demanda do relacionamento médico
CREATE TYPE tipo_relacionamento AS ENUM ('Reclamação', 'Feedback Positivo', 'Alinhamento Escalas', 'Ação Comemorativa');

-- Criar enum para status de assinatura de contrato
CREATE TYPE status_assinatura_contrato AS ENUM ('Sim', 'Pendente');

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
CREATE POLICY "Authenticated users can view relacionamento_medico"
ON public.relacionamento_medico FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert relacionamento_medico"
ON public.relacionamento_medico FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update relacionamento_medico"
ON public.relacionamento_medico FOR UPDATE
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete relacionamento_medico"
ON public.relacionamento_medico FOR DELETE
TO authenticated USING (true);

-- Políticas RLS para contratos
CREATE POLICY "Authenticated users can view contratos"
ON public.contratos FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert contratos"
ON public.contratos FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update contratos"
ON public.contratos FOR UPDATE
TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete contratos"
ON public.contratos FOR DELETE
TO authenticated USING (true);

-- Políticas RLS para config_lista_items
CREATE POLICY "Authenticated users can view config_lista_items"
ON public.config_lista_items FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins can manage config_lista_items"
ON public.config_lista_items FOR ALL
TO authenticated USING (is_admin(auth.uid()));

-- Políticas RLS para historico_acessos
CREATE POLICY "Admins can view all historico_acessos"
ON public.historico_acessos FOR SELECT
TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Users can insert their own historico_acessos"
ON public.historico_acessos FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

-- Políticas RLS para menu_permissions
CREATE POLICY "Authenticated users can view menu_permissions"
ON public.menu_permissions FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins can manage menu_permissions"
ON public.menu_permissions FOR ALL
TO authenticated USING (is_admin(auth.uid()));

-- Trigger para atualizar updated_at em relacionamento_medico
CREATE TRIGGER update_relacionamento_medico_updated_at
BEFORE UPDATE ON public.relacionamento_medico
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para atualizar updated_at em contratos
CREATE TRIGGER update_contratos_updated_at
BEFORE UPDATE ON public.contratos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();