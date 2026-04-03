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
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_profissionais" ON public.ages_profissionais FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_profissionais_doc" ON public.ages_profissionais_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_contratos" ON public.ages_contratos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_producao" ON public.ages_producao FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_leads" ON public.ages_leads FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_licitacoes" ON public.ages_licitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_contratos_doc" ON public.ages_contratos_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_clientes" ON public.ages_clientes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_unidades" ON public.ages_unidades FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_lead_hist" ON public.ages_lead_historico FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_lead_anexos" ON public.ages_lead_anexos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_propostas" ON public.ages_propostas FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_contrato_itens" ON public.ages_contrato_itens FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_contrato_renov" ON public.ages_contrato_renovacoes FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;
DO $cp$ BEGIN CREATE POLICY "auth_all_ages_contrato_aditivos" ON public.ages_contrato_aditivos FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $cp$;

-- Triggers
CREATE TRIGGER update_ages_profissionais_updated_at BEFORE UPDATE ON public.ages_profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ages_contratos_updated_at BEFORE UPDATE ON public.ages_contratos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ages_leads_updated_at BEFORE UPDATE ON public.ages_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ages_clientes_updated_at BEFORE UPDATE ON public.ages_clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ages_unidades_updated_at BEFORE UPDATE ON public.ages_unidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ages_clientes_status ON public.ages_clientes(status_cliente);
CREATE INDEX IF NOT EXISTS idx_ages_unidades_cliente ON public.ages_unidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_historico_lead_id ON public.ages_lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_anexos_lead_id ON public.ages_lead_anexos(lead_id);

-- Sequência para codigo_interno
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;
ALTER TABLE public.ages_contratos ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq');