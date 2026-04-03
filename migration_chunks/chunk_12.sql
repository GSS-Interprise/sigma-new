
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email_financeiro TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefone_financeiro TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nome_unidade TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado TEXT;

CREATE TABLE IF NOT EXISTS public.contrato_renovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5, 2),
  valor NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
CREATE POLICY "Authorized users can manage contrato_renovacoes"
ON public.contrato_renovacoes FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));

DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos FOR SELECT
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));

DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can insert contrato_anexos"
ON public.contrato_anexos FOR INSERT
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));

-- === 20260403003745_cb21b369-59d4-450a-8d3f-d642d09debe2.sql ===
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
    CREATE TYPE especialidade_cliente AS ENUM ('Hospital', 'Clínica', 'UBS', 'Outros');
    CREATE TYPE status_medico AS ENUM ('Ativo', 'Inativo', 'Suspenso');
    CREATE TYPE tipo_relacionamento AS ENUM ('Reclamação', 'Feedback Positivo', 'Alinhamento Escalas', 'Ação Comemorativa');
    CREATE TYPE status_assinatura_contrato AS ENUM ('Sim', 'Pendente');
    CREATE TYPE status_licitacao AS ENUM ('captacao_edital','edital_analise','deliberacao','esclarecimentos_impugnacao','cadastro_proposta','aguardando_sessao','em_disputa','proposta_final','recurso_contrarrazao','adjudicacao_homologacao','arrematados','descarte_edital','nao_ganhamos');
    CREATE TYPE status_disparo AS ENUM ('nova_oportunidade','disparo','analise_proposta','negociacao','investigacao','proposta_aceita','proposta_arquivada','relacionamento_medico');
    CREATE TYPE status_relacionamento AS ENUM ('inicio_identificacao','captacao_documentacao','pendencia_documentacao','documentacao_finalizada','criacao_escalas');

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
    DROP POLICY IF EXISTS "auth_all_relacionamento" ON public.relacionamento_medico;
CREATE POLICY "auth_all_relacionamento" ON public.relacionamento_medico FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_contratos" ON public.contratos;
CREATE POLICY "auth_all_contratos" ON public.contratos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_select_config" ON public.config_lista_items;
CREATE POLICY "auth_select_config" ON public.config_lista_items FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "auth_select_menu" ON public.menu_permissions;
CREATE POLICY "auth_select_menu" ON public.menu_permissions FOR SELECT TO authenticated USING (true);
    DROP POLICY IF EXISTS "auth_all_licitacoes" ON public.licitacoes;
CREATE POLICY "auth_all_licitacoes" ON public.licitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_worklist" ON public.worklist_tarefas;
CREATE POLICY "auth_all_worklist" ON public.worklist_tarefas FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_kanban" ON public.kanban_status_config;
CREATE POLICY "auth_all_kanban" ON public.kanban_status_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_unidades" ON public.unidades;
CREATE POLICY "auth_all_unidades" ON public.unidades FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_leads" ON public.leads;
CREATE POLICY "auth_all_leads" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- === 20260403004019_e733a524-8e20-417e-82ec-e5762ef5983b.sql ===
-- AGES Profissionais
CREATE TABLE IF NOT EXISTS public.ages_profissionais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  data_nascimento DATE,
  profissao TEXT NOT NULL,
  registro_profissional TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  banco TEXT,
  agencia TEXT,
  conta_corrente TEXT,
  chave_pix TEXT,
  status TEXT NOT NULL DEFAULT 'pendente_documentacao',
  observacoes TEXT,
  lead_origem_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_profissionais ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ages_profissionais_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id UUID NOT NULL REFERENCES public.ages_profissionais(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  data_emissao DATE,
  data_validade DATE,
  observacoes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_profissionais_documentos ENABLE ROW LEVEL SECURITY;

-- AGES Contratos
CREATE TABLE IF NOT EXISTS public.ages_contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_contrato TEXT,
  profissional_id UUID REFERENCES public.ages_profissionais(id),
  cliente_id UUID,
  unidade_id UUID,
  tipo_contrato TEXT,
  objeto_contrato TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  valor_mensal NUMERIC,
  valor_hora NUMERIC,
  carga_horaria_mensal INTEGER,
  documento_url TEXT,
  status TEXT NOT NULL DEFAULT 'em_negociacao',
  observacoes TEXT,
  ages_cliente_id UUID,
  ages_unidade_id UUID,
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  prazo_meses INTEGER,
  codigo_interno INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_contratos ENABLE ROW LEVEL SECURITY;

-- AGES Produção
CREATE TABLE IF NOT EXISTS public.ages_producao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id UUID NOT NULL REFERENCES public.ages_profissionais(id),
  cliente_id UUID,
  unidade_id UUID,
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  total_horas NUMERIC NOT NULL DEFAULT 0,
  tipo_alocacao TEXT,
  folha_ponto_url TEXT,
  status_conferencia TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  conferido_por UUID,
  conferido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profissional_id, cliente_id, mes_referencia, ano_referencia)
);
ALTER TABLE public.ages_producao ENABLE ROW LEVEL SECURITY;

-- AGES Leads
CREATE TABLE IF NOT EXISTS public.ages_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  profissao TEXT,
  telefone TEXT,
  email TEXT,
  cidade TEXT,
  uf TEXT,
  origem TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  observacoes TEXT,
  arquivo_id TEXT,
  cpf TEXT,
  rg TEXT,
  data_nascimento DATE,
  endereco TEXT,
  cep TEXT,
  registro_profissional TEXT,
  banco TEXT,
  agencia TEXT,
  conta_corrente TEXT,
  chave_pix TEXT,
  telefones_adicionais TEXT[],
  modalidade_contrato TEXT,
  local_prestacao_servico TEXT,
  data_inicio_contrato DATE,
  valor_contrato NUMERIC,
  especificacoes_contrato TEXT,
  unidades_vinculadas uuid[] DEFAULT '{}'::uuid[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_leads ENABLE ROW LEVEL SECURITY;

-- AGES Licitações
CREATE TABLE IF NOT EXISTS public.ages_licitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID,
  status TEXT NOT NULL DEFAULT 'pregoes_ages',
  prazo_retorno_gss DATE,
  prazo_licitacao DATE,
  responsavel_id UUID,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_licitacoes ENABLE ROW LEVEL SECURITY;

-- AGES Contratos Documentos
CREATE TABLE IF NOT EXISTS public.ages_contratos_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  observacoes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_contratos_documentos ENABLE ROW LEVEL SECURITY;

-- AGES Clientes
CREATE TABLE IF NOT EXISTS public.ages_clientes (
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
ALTER TABLE public.ages_clientes ENABLE ROW LEVEL SECURITY;

-- AGES Unidades
CREATE TABLE IF NOT EXISTS public.ages_unidades (
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
ALTER TABLE public.ages_unidades ENABLE ROW LEVEL SECURITY;

-- AGES Lead Histórico
CREATE TABLE IF NOT EXISTS public.ages_lead_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  descricao_resumida TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  campos_alterados TEXT[],
  usuario_id UUID,
  usuario_nome TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_lead_historico ENABLE ROW LEVEL SECURITY;

-- AGES Lead Anexos
CREATE TABLE IF NOT EXISTS public.ages_lead_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  tipo_documento TEXT,
  observacoes TEXT,
  uploaded_by UUID,
  uploaded_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_lead_anexos ENABLE ROW LEVEL SECURITY;

-- AGES Propostas
CREATE TABLE IF NOT EXISTS public.ages_propostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  profissional_id UUID REFERENCES public.ages_profissionais(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.ages_clientes(id) ON DELETE SET NULL,
  unidade_id UUID REFERENCES public.ages_unidades(id) ON DELETE SET NULL,
  contrato_id UUID REFERENCES public.ages_contratos(id) ON DELETE SET NULL,
  valor NUMERIC,
  status TEXT NOT NULL DEFAULT 'rascunho',
  observacoes TEXT,
  descricao TEXT,
  id_proposta TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_propostas ENABLE ROW LEVEL SECURITY;

-- AGES Contrato Itens
CREATE TABLE IF NOT EXISTS public.ages_contrato_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_contrato_itens ENABLE ROW LEVEL SECURITY;

-- AGES Contrato Renovações
CREATE TABLE IF NOT EXISTS public.ages_contrato_renovacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC,
  valor NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_contrato_renovacoes ENABLE ROW LEVEL SECURITY;

-- AGES Contrato Aditivos
CREATE TABLE IF NOT EXISTS public.ages_contrato_aditivos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  data_termino DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.ages_contrato_aditivos ENABLE ROW LEVEL SECURITY;

-- FKs on ages_contratos
ALTER TABLE public.ages_contratos ADD CONSTRAINT fk_ages_contratos_ages_cliente FOREIGN KEY (ages_cliente_id) REFERENCES public.ages_clientes(id) ON DELETE SET NULL;
ALTER TABLE public.ages_contratos ADD CONSTRAINT fk_ages_contratos_ages_unidade FOREIGN KEY (ages_unidade_id) REFERENCES public.ages_unidades(id) ON DELETE SET NULL;

-- RLS Policies for all AGES tables
    DROP POLICY IF EXISTS "auth_all_ages_profissionais" ON public.ages_profissionais;
CREATE POLICY "auth_all_ages_profissionais" ON public.ages_profissionais FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_profissionais_doc" ON public.ages_profissionais_documentos;
CREATE POLICY "auth_all_ages_profissionais_doc" ON public.ages_profissionais_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_contratos" ON public.ages_contratos;
CREATE POLICY "auth_all_ages_contratos" ON public.ages_contratos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_producao" ON public.ages_producao;
CREATE POLICY "auth_all_ages_producao" ON public.ages_producao FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_leads" ON public.ages_leads;
CREATE POLICY "auth_all_ages_leads" ON public.ages_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_licitacoes" ON public.ages_licitacoes;
CREATE POLICY "auth_all_ages_licitacoes" ON public.ages_licitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_contratos_doc" ON public.ages_contratos_documentos;
CREATE POLICY "auth_all_ages_contratos_doc" ON public.ages_contratos_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_clientes" ON public.ages_clientes;
CREATE POLICY "auth_all_ages_clientes" ON public.ages_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_unidades" ON public.ages_unidades;
CREATE POLICY "auth_all_ages_unidades" ON public.ages_unidades FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_lead_hist" ON public.ages_lead_historico;
CREATE POLICY "auth_all_ages_lead_hist" ON public.ages_lead_historico FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_lead_anexos" ON public.ages_lead_anexos;
CREATE POLICY "auth_all_ages_lead_anexos" ON public.ages_lead_anexos FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_propostas" ON public.ages_propostas;
CREATE POLICY "auth_all_ages_propostas" ON public.ages_propostas FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_contrato_itens" ON public.ages_contrato_itens;
CREATE POLICY "auth_all_ages_contrato_itens" ON public.ages_contrato_itens FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_contrato_renov" ON public.ages_contrato_renovacoes;
CREATE POLICY "auth_all_ages_contrato_renov" ON public.ages_contrato_renovacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "auth_all_ages_contrato_aditivos" ON public.ages_contrato_aditivos;
CREATE POLICY "auth_all_ages_contrato_aditivos" ON public.ages_contrato_aditivos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Triggers
DROP TRIGGER IF EXISTS "update_ages_profissionais_updated_at" ON public.ages_profissionais;
CREATE TRIGGER update_ages_profissionais_updated_at BEFORE UPDATE ON public.ages_profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_ages_contratos_updated_at" ON public.ages_contratos;
CREATE TRIGGER update_ages_contratos_updated_at BEFORE UPDATE ON public.ages_contratos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_ages_leads_updated_at" ON public.ages_leads;
CREATE TRIGGER update_ages_leads_updated_at BEFORE UPDATE ON public.ages_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_ages_clientes_updated_at" ON public.ages_clientes;
CREATE TRIGGER update_ages_clientes_updated_at BEFORE UPDATE ON public.ages_clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_ages_unidades_updated_at" ON public.ages_unidades;
CREATE TRIGGER update_ages_unidades_updated_at BEFORE UPDATE ON public.ages_unidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ages_clientes_status ON public.ages_clientes(status_cliente);
CREATE INDEX IF NOT EXISTS idx_ages_unidades_cliente ON public.ages_unidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_historico_lead_id ON public.ages_lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_anexos_lead_id ON public.ages_lead_anexos(lead_id);

-- Sequência para codigo_interno
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;
ALTER TABLE public.ages_contratos ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq');

