-- Função update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enums
DO $tyblk$ BEGIN CREATE TYPE status_cliente AS ENUM ('Ativo', 'Inativo', 'Suspenso', 'Cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE especialidade_cliente AS ENUM ('Hospital', 'Clínica', 'UBS', 'Outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE status_medico AS ENUM ('Ativo', 'Inativo', 'Suspenso'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE tipo_relacionamento AS ENUM ('Reclamação', 'Feedback Positivo', 'Alinhamento Escalas', 'Ação Comemorativa'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE status_assinatura_contrato AS ENUM ('Sim', 'Pendente'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE status_licitacao AS ENUM ('captacao_edital','edital_analise','deliberacao','esclarecimentos_impugnacao','cadastro_proposta','aguardando_sessao','em_disputa','proposta_final','recurso_contrarrazao','adjudicacao_homologacao','arrematados','descarte_edital','nao_ganhamos'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE status_disparo AS ENUM ('nova_oportunidade','disparo','analise_proposta','negociacao','investigacao','proposta_aceita','proposta_arquivada','relacionamento_medico'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE status_relacionamento AS ENUM ('inicio_identificacao','captacao_documentacao','pendencia_documentacao','documentacao_finalizada','criacao_escalas'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;

-- Tabelas de suporte
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS cliente_vinculado_id UUID;
ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS status_medico TEXT;

CREATE TABLE IF NOT EXISTS public.relacionamento_medico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo tipo_relacionamento NOT NULL,
  descricao TEXT NOT NULL,
  cliente_vinculado_id UUID,
  medico_vinculado_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.relacionamento_medico ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contratos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID,
  medico_id UUID,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  condicao_pagamento TEXT,
  valor_estimado NUMERIC(15,2),
  prazo_meses INTEGER DEFAULT 12,
  data_termino DATE,
  status_contrato TEXT DEFAULT 'Ativo',
  especialidade_contrato TEXT,
  codigo_interno INTEGER,
  objeto_contrato TEXT,
  tipo_servico TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.config_lista_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campo_nome TEXT NOT NULL,
  valor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(campo_nome, valor)
);
ALTER TABLE public.config_lista_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.historico_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.historico_acessos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.menu_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  menu_item TEXT NOT NULL,
  can_access BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(role, menu_item)
);
ALTER TABLE public.menu_permissions ENABLE ROW LEVEL SECURITY;

-- Licitações
CREATE TABLE IF NOT EXISTS public.licitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_edital TEXT NOT NULL,
  orgao TEXT NOT NULL,
  objeto TEXT NOT NULL,
  valor_estimado NUMERIC(15,2),
  data_abertura DATE,
  data_limite DATE,
  status status_licitacao NOT NULL DEFAULT 'captacao_edital',
  responsavel_id UUID REFERENCES auth.users(id),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.licitacoes ENABLE ROW LEVEL SECURITY;

-- Worklist
CREATE TABLE IF NOT EXISTS public.worklist_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL,
  responsavel_id UUID REFERENCES auth.users(id),
  data_limite DATE,
  prioridade TEXT DEFAULT 'media',
  licitacao_id UUID,
  contrato_id UUID,
  relacionamento_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.worklist_tarefas ENABLE ROW LEVEL SECURITY;

-- Kanban status config
CREATE TABLE IF NOT EXISTS public.kanban_status_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL,
  status_id TEXT NOT NULL,
  label TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(modulo, status_id)
);
ALTER TABLE public.kanban_status_config ENABLE ROW LEVEL SECURITY;

-- Unidades (para referência em ages_contratos)
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade TEXT,
  crm TEXT,
  telefone TEXT,
  email TEXT,
  cidade TEXT,
  uf TEXT,
  origem TEXT,
  status TEXT DEFAULT 'novo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- RLS policies (permissive for all authenticated)
DO $cp$ BEGIN CREATE POLICY "auth_all_relacionamento" ON public.relacionamento_medico FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_contratos" ON public.contratos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_select_config" ON public.config_lista_items FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_select_menu" ON public.menu_permissions FOR SELECT TO authenticated USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_licitacoes" ON public.licitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_worklist" ON public.worklist_tarefas FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_kanban" ON public.kanban_status_config FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_unidades" ON public.unidades FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;