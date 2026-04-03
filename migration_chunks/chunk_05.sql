
DROP TRIGGER IF EXISTS "update_servico_updated_at" ON public.servico;
CREATE TRIGGER update_servico_updated_at
  BEFORE UPDATE ON public.servico
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_proposta_updated_at" ON public.proposta;
CREATE TRIGGER update_proposta_updated_at
  BEFORE UPDATE ON public.proposta
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251204145834_bc40aea2-faac-4403-bd1d-47d0ca80e500.sql ===
-- Update the licitacoes-anexos bucket to allow all file types
UPDATE storage.buckets 
SET allowed_mime_types = NULL
WHERE id = 'licitacoes-anexos';

-- If bucket doesn't exist, create it without restrictions
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('licitacoes-anexos', 'licitacoes-anexos', true, NULL)
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = NULL;

-- === 20251204174501_3389fdfc-9014-4028-9e18-66325ebcf798.sql ===
-- Create licitacoes_anexos table
CREATE TABLE IF NOT EXISTS public.licitacoes_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licitacoes_anexos ENABLE ROW LEVEL SECURITY;

-- RLS policies (authenticated users can manage)
DROP POLICY IF EXISTS "Authenticated users can view anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can view anexos" 
ON public.licitacoes_anexos 
FOR SELECT 
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can insert anexos" 
ON public.licitacoes_anexos 
FOR INSERT 
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can delete anexos" 
ON public.licitacoes_anexos 
FOR DELETE 
TO authenticated
USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_licitacoes_anexos_licitacao_id ON public.licitacoes_anexos(licitacao_id);

-- === 20251204175332_628f6b3a-ec10-4d63-a3ff-06615578a8ee.sql ===
-- Remove MIME type restrictions from editais-pdfs bucket to allow all file types including ZIP
UPDATE storage.buckets 
SET allowed_mime_types = NULL 
WHERE id = 'editais-pdfs';

-- === 20251204184049_01db28cc-294f-4a53-aaf4-6ece7b843dd0.sql ===
-- Delete all objects from editais-pdfs bucket
DELETE FROM storage.objects WHERE bucket_id = 'editais-pdfs';

-- === 20251205112240_51466887-1374-49c8-849d-06b4dcb0fca5.sql ===
-- Marketing Conteúdos (Posts de Redes Sociais)
CREATE TABLE IF NOT EXISTS public.marketing_conteudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  conta_perfil TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'reels', 'story', 'video', 'carousel')),
  objetivo TEXT,
  legenda TEXT,
  materiais TEXT[] DEFAULT '{}',
  checklist JSONB DEFAULT '[]',
  comentarios_internos JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'em_producao', 'em_revisao', 'aprovado', 'agendado', 'publicado')),
  data_publicacao TIMESTAMP WITH TIME ZONE,
  metricas JSONB DEFAULT '{}',
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Eventos
CREATE TABLE IF NOT EXISTS public.marketing_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE,
  local TEXT,
  objetivo TEXT,
  tipo_evento TEXT,
  fornecedores JSONB DEFAULT '[]',
  orcamentos JSONB DEFAULT '[]',
  materiais TEXT[] DEFAULT '{}',
  timeline JSONB DEFAULT '{"pre_evento": [], "durante": [], "pos_evento": []}',
  checklist_pre JSONB DEFAULT '[]',
  checklist_durante JSONB DEFAULT '[]',
  checklist_pos JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planejando' CHECK (status IN ('planejando', 'executando', 'finalizado')),
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Tráfego Pago
CREATE TABLE IF NOT EXISTS public.marketing_trafego_pago (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  objetivo TEXT,
  orcamento NUMERIC(12,2),
  publico TEXT,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('meta_ads', 'google_ads', 'linkedin_ads', 'tiktok_ads', 'outro')),
  data_inicio DATE,
  data_fim DATE,
  criativos TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'ativa', 'pausada', 'finalizada')),
  resultados JSONB DEFAULT '{"cpc": null, "cpm": null, "ctr": null, "impressoes": null, "cliques": null, "conversoes": null, "gasto_total": null}',
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Endomarketing
CREATE TABLE IF NOT EXISTS public.marketing_endomarketing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  publico_interno TEXT[],
  objetivo TEXT,
  checklist JSONB DEFAULT '[]',
  artes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'em_criacao' CHECK (status IN ('em_criacao', 'aprovado', 'enviado')),
  data_envio TIMESTAMP WITH TIME ZONE,
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Banco de Ideias
CREATE TABLE IF NOT EXISTS public.marketing_ideias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('post', 'evento', 'campanha', 'endomarketing', 'trafego', 'outro')),
  descricao TEXT,
  referencia_url TEXT,
  referencia_imagem TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'analisada', 'convertida', 'descartada')),
  convertido_para_tipo TEXT,
  convertido_para_id UUID,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Quadro de Prioridades
CREATE TABLE IF NOT EXISTS public.marketing_prioridades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  coluna TEXT NOT NULL DEFAULT 'para_depois' CHECK (coluna IN ('urgente', 'importante', 'em_andamento', 'para_depois')),
  ordem INTEGER DEFAULT 0,
  tipo_relacionado TEXT,
  id_relacionado UUID,
  responsavel_id UUID,
  data_limite DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Planejamento de Campanhas
CREATE TABLE IF NOT EXISTS public.marketing_planejamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  objetivo TEXT NOT NULL,
  publico TEXT,
  materiais_necessarios TEXT[] DEFAULT '{}',
  cronograma JSONB DEFAULT '[]',
  tarefas JSONB DEFAULT '[]',
  relatorio_final TEXT,
  status TEXT NOT NULL DEFAULT 'em_planejamento' CHECK (status IN ('em_planejamento', 'em_execucao', 'finalizado')),
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_trafego_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_endomarketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ideias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_prioridades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_planejamentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_conteudos" ON public.marketing_conteudos;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_conteudos" ON public.marketing_conteudos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_eventos" ON public.marketing_eventos;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_eventos" ON public.marketing_eventos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_trafego_pago" ON public.marketing_trafego_pago;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_trafego_pago" ON public.marketing_trafego_pago
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_endomarketing" ON public.marketing_endomarketing;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_endomarketing" ON public.marketing_endomarketing
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_ideias" ON public.marketing_ideias;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_ideias" ON public.marketing_ideias
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_prioridades" ON public.marketing_prioridades;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_prioridades" ON public.marketing_prioridades
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar marketing_planejamentos" ON public.marketing_planejamentos;
CREATE POLICY "Usuários autorizados podem gerenciar marketing_planejamentos" ON public.marketing_planejamentos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

-- === 20251205171318_265f48fd-f3be-45f6-96be-530017d90275.sql ===
-- Create table for médicos kanban cards
CREATE TABLE IF NOT EXISTS public.medico_kanban_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  data_nascimento DATE,
  crm TEXT,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'novo_canal',
  canal_id UUID REFERENCES public.comunicacao_canais(id) ON DELETE SET NULL,
  medico_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medico_kanban_cards ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar cards" ON public.medico_kanban_cards;
CREATE POLICY "Usuários autenticados podem visualizar cards"
ON public.medico_kanban_cards FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards;
CREATE POLICY "Usuários autorizados podem gerenciar cards"
ON public.medico_kanban_cards FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

-- Insert default kanban columns for médicos module
INSERT INTO public.kanban_status_config (modulo, status_id, label, cor, ordem, ativo)
VALUES 
  ('medicos', 'novo_canal', 'Novo Canal / Lead Médico', '#6366f1', 1, true),
  ('medicos', 'captando_info', 'Captando Informações', '#f59e0b', 2, true),
  ('medicos', 'revisar_dados', 'Revisar Dados', '#ef4444', 3, true),
  ('medicos', 'pronto_cadastro', 'Pronto para Cadastro', '#8b5cf6', 4, true),
  ('medicos', 'cadastrado', 'Cadastrado', '#3b82f6', 5, true),
  ('medicos', 'validacao_documental', 'Em Validação Documental', '#f97316', 6, true),
  ('medicos', 'ativo', 'Ativo', '#22c55e', 7, true);

-- DROP TRIGGER IF EXISTS "for" ON public.medico_kanban_cards;
-- Create trigger for updated_at
CREATE TRIGGER update_medico_kanban_cards_updated_at
BEFORE UPDATE ON public.medico_kanban_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251208114245_9c8c541e-8ffd-4e1e-8d63-42f9dc3c5e51.sql ===
-- Add new fields to servico table
ALTER TABLE public.servico 
ADD COLUMN IF NOT EXISTS especialidade text,
ADD COLUMN IF NOT EXISTS lista_servicos text[] DEFAULT '{}';

-- === 20251208130843_0ed82daa-88cc-45b0-8694-4e610b11d06f.sql ===
-- Alterar proposta: remover obrigatoriedade de lead_id e adicionar novos campos
DO $altc$ BEGIN ALTER TABLE public.proposta 
  ALTER COLUMN lead_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- Adicionar campo id_proposta (identificador único formatado)
DO $acol$ BEGIN ALTER TABLE public.proposta 
  ADD COLUMN id_proposta TEXT UNIQUE; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Adicionar campo descricao
DO $acol$ BEGIN ALTER TABLE public.proposta 
  ADD COLUMN descricao TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Comentário explicativo do formato do id_proposta
COMMENT ON COLUMN public.proposta.id_proposta IS 'ID formatado: {codigo_contrato}{3letrasServico}-{especialidade}-{ddMmmYY}-{valorFormatado}. Ex: 75Hem-Neo-08Dez25-50k';

-- === 20251208133040_b34b0d35-0354-4d23-b9ad-28516c219a28.sql ===
-- Add updated_at column to proposta table
ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- DROP TRIGGER IF EXISTS "for" ON public.proposta;
-- Create trigger for automatic timestamp updates if not exists
CREATE OR REPLACE TRIGGER update_proposta_updated_at
BEFORE UPDATE ON public.proposta
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251208134704_63698c56-e85b-4cc1-9b20-66144d6d346f.sql ===
-- Create table for medico kanban card attachments
CREATE TABLE IF NOT EXISTS public.medico_kanban_card_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.medico_kanban_cards(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medico_kanban_card_anexos ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Authenticated users can view card attachments" ON public.medico_kanban_card_anexos;
CREATE POLICY "Authenticated users can view card attachments"
ON public.medico_kanban_card_anexos
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert card attachments" ON public.medico_kanban_card_anexos;
CREATE POLICY "Authenticated users can insert card attachments"
ON public.medico_kanban_card_anexos
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete card attachments" ON public.medico_kanban_card_anexos;
CREATE POLICY "Authenticated users can delete card attachments"
ON public.medico_kanban_card_anexos
FOR DELETE
TO authenticated
USING (true);

-- Create storage bucket for kanban card attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('medico-kanban-anexos', 'medico-kanban-anexos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Anyone can view medico kanban attachments" ON storage.objects;
CREATE POLICY "Anyone can view medico kanban attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'medico-kanban-anexos');

DROP POLICY IF EXISTS "Authenticated users can upload medico kanban attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload medico kanban attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'medico-kanban-anexos');

DROP POLICY IF EXISTS "Authenticated users can delete medico kanban attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete medico kanban attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'medico-kanban-anexos');

-- === 20251208164117_bf18f048-7131-48cf-8e0f-a2ae33156340.sql ===
-- Create table for captação-specific user permissions
CREATE TABLE IF NOT EXISTS public.captacao_permissoes_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pode_disparos_email BOOLEAN NOT NULL DEFAULT false,
  pode_disparos_zap BOOLEAN NOT NULL DEFAULT false,
  pode_acompanhamento BOOLEAN NOT NULL DEFAULT false,
  pode_leads BOOLEAN NOT NULL DEFAULT false,
  pode_blacklist BOOLEAN NOT NULL DEFAULT false,
  pode_seigzaps_config BOOLEAN NOT NULL DEFAULT false,
  pode_contratos_servicos BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.captacao_permissoes_usuario ENABLE ROW LEVEL SECURITY;

-- Function to check if user is leader of captação sector
CREATE OR REPLACE FUNCTION public.is_captacao_leader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    JOIN public.setores s ON s.id = p.setor_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'lideres'
      AND LOWER(s.nome) LIKE '%capta%'
  )
$$;

-- Function to check if user has specific captação permission
CREATE OR REPLACE FUNCTION public.has_captacao_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Admins and captação leaders have all permissions
    WHEN is_admin(_user_id) OR is_captacao_leader(_user_id) OR has_role(_user_id, 'gestor_captacao') THEN true
    -- Check specific permission
    ELSE (
      SELECT CASE _permission
        WHEN 'disparos_email' THEN COALESCE(pode_disparos_email, false)
        WHEN 'disparos_zap' THEN COALESCE(pode_disparos_zap, false)
        WHEN 'acompanhamento' THEN COALESCE(pode_acompanhamento, false)
        WHEN 'leads' THEN COALESCE(pode_leads, false)
        WHEN 'blacklist' THEN COALESCE(pode_blacklist, false)
        WHEN 'seigzaps_config' THEN COALESCE(pode_seigzaps_config, false)
        WHEN 'contratos_servicos' THEN COALESCE(pode_contratos_servicos, false)
        ELSE false
      END
      FROM public.captacao_permissoes_usuario
      WHERE user_id = _user_id
    )
  END;
$$;

-- RLS Policies
-- Leaders can view all captação permissions
DROP POLICY IF EXISTS "Leaders can view captação permissions" ON public.captacao_permissoes_usuario;
CREATE POLICY "Leaders can view captação permissions"
ON public.captacao_permissoes_usuario
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can insert captação permissions
DROP POLICY IF EXISTS "Leaders can insert captação permissions" ON public.captacao_permissoes_usuario;
CREATE POLICY "Leaders can insert captação permissions"
ON public.captacao_permissoes_usuario
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can update captação permissions
DROP POLICY IF EXISTS "Leaders can update captação permissions" ON public.captacao_permissoes_usuario;
CREATE POLICY "Leaders can update captação permissions"
ON public.captacao_permissoes_usuario
FOR UPDATE
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can delete captação permissions
DROP POLICY IF EXISTS "Leaders can delete captação permissions" ON public.captacao_permissoes_usuario;
CREATE POLICY "Leaders can delete captação permissions"
ON public.captacao_permissoes_usuario
FOR DELETE
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Users can view their own permissions
DROP POLICY IF EXISTS "Users can view own captação permissions" ON public.captacao_permissoes_usuario;
CREATE POLICY "Users can view own captação permissions"
ON public.captacao_permissoes_usuario
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS "update_captacao_permissoes_updated_at" ON public.captacao_permissoes_usuario;
CREATE TRIGGER update_captacao_permissoes_updated_at
BEFORE UPDATE ON public.captacao_permissoes_usuario
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251208171307_f6766e76-991e-4740-ad1f-e4a92048e39b.sql ===

-- =============================================================================
-- EVOLUÇÃO DO MODELO DE DADOS: LEAD COMO PONTA DO FUNIL
-- Rastreabilidade completa: Licitação -> Contrato -> Serviço -> Proposta -> Lead -> Médico
-- =============================================================================

-- 1) Criar ENUM para tipos de evento no histórico do lead
DO $$ BEGIN
  DO $tw$ BEGIN CREATE TYPE tipo_evento_lead AS ENUM (
    'disparo_email',
    'disparo_zap', 
    'proposta_enviada',
    'proposta_aceita',
    'proposta_recusada',
    'convertido_em_medico',
    'atendimento',
    'contato_telefonico',
    'reuniao_agendada',
    'documentacao_solicitada',
    'documentacao_recebida',
    'outro'
  ); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) Adicionar lead_id na tabela medicos para rastrear origem
ALTER TABLE public.medicos 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id);

-- 3) Adicionar campos de origem/rastreabilidade na tabela leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS licitacao_origem_id uuid REFERENCES public.licitacoes(id),
ADD COLUMN IF NOT EXISTS contrato_origem_id uuid REFERENCES public.contratos(id),
ADD COLUMN IF NOT EXISTS servico_origem_id uuid REFERENCES public.servico(id),
ADD COLUMN IF NOT EXISTS data_conversao timestamp with time zone,
ADD COLUMN IF NOT EXISTS convertido_por uuid;

-- 4) Garantir FK de proposta para lead (se tabela proposta existir)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposta' AND table_schema = 'public') THEN
    -- Adicionar lead_id se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposta' AND column_name = 'lead_id') THEN
      DO $acol$ BEGIN ALTER TABLE public.proposta ADD COLUMN lead_id uuid REFERENCES public.leads(id); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;
    END IF;
    -- Adicionar licitacao_id para rastreio completo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposta' AND column_name = 'licitacao_id') THEN
      DO $acol$ BEGIN ALTER TABLE public.proposta ADD COLUMN licitacao_id uuid REFERENCES public.licitacoes(id); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;
    END IF;
  END IF;
END $$;

-- 5) Criar tabela de histórico do lead com rastreabilidade completa
CREATE TABLE IF NOT EXISTS public.lead_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo_evento tipo_evento_lead NOT NULL,
  
  -- Referências opcionais para rastreabilidade
  proposta_id uuid REFERENCES public.proposta(id),
  servico_id uuid REFERENCES public.servico(id),
  contrato_id uuid REFERENCES public.contratos(id),
  licitacao_id uuid REFERENCES public.licitacoes(id),
  disparo_log_id uuid REFERENCES public.disparos_log(id),
  disparo_programado_id uuid REFERENCES public.disparos_programados(id),
  medico_id uuid REFERENCES public.medicos(id),
  
  -- Detalhes do evento
  descricao_resumida text NOT NULL,
  metadados jsonb DEFAULT '{}'::jsonb,
  
  -- Auditoria
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- 6) Criar índices para performance em consultas de KPI
CREATE INDEX IF NOT EXISTS idx_lead_historico_lead_id ON public.lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_historico_tipo_evento ON public.lead_historico(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_lead_historico_criado_em ON public.lead_historico(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lead_historico_proposta_id ON public.lead_historico(proposta_id) WHERE proposta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_historico_contrato_id ON public.lead_historico(contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_historico_licitacao_id ON public.lead_historico(licitacao_id) WHERE licitacao_id IS NOT NULL;

-- Índices na tabela leads para consultas de origem
CREATE INDEX IF NOT EXISTS idx_leads_licitacao_origem ON public.leads(licitacao_origem_id) WHERE licitacao_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_contrato_origem ON public.leads(contrato_origem_id) WHERE contrato_origem_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_servico_origem ON public.leads(servico_origem_id) WHERE servico_origem_id IS NOT NULL;

-- Índice na tabela medicos para buscar por lead de origem
CREATE INDEX IF NOT EXISTS idx_medicos_lead_id ON public.medicos(lead_id) WHERE lead_id IS NOT NULL;

-- 7) Habilitar RLS na nova tabela
ALTER TABLE public.lead_historico ENABLE ROW LEVEL SECURITY;

-- 8) Políticas RLS para lead_historico
DROP POLICY IF EXISTS "Usuários autorizados podem visualizar histórico de leads" ON public.lead_historico;
CREATE POLICY "Usuários autorizados podem visualizar histórico de leads"
ON public.lead_historico
FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem inserir histórico de leads" ON public.lead_historico;
CREATE POLICY "Usuários autorizados podem inserir histórico de leads"
ON public.lead_historico
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem atualizar histórico de leads" ON public.lead_historico;
CREATE POLICY "Usuários autorizados podem atualizar histórico de leads"
ON public.lead_historico
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- 9) Comentários para documentação
COMMENT ON TABLE public.lead_historico IS 'Histórico completo de eventos do lead no funil: disparos, propostas, conversões';
COMMENT ON COLUMN public.lead_historico.tipo_evento IS 'Tipo do evento: disparo_email, disparo_zap, proposta_enviada, proposta_aceita, proposta_recusada, convertido_em_medico, atendimento, outro';
COMMENT ON COLUMN public.lead_historico.metadados IS 'Detalhes técnicos em JSON: assunto email, corpo mensagem, valores proposta, etc';
COMMENT ON COLUMN public.medicos.lead_id IS 'Referência ao lead que originou este médico (rastreabilidade do funil)';
COMMENT ON COLUMN public.leads.licitacao_origem_id IS 'Licitação que originou a oportunidade deste lead';
COMMENT ON COLUMN public.leads.contrato_origem_id IS 'Contrato que originou a oportunidade deste lead';
COMMENT ON COLUMN public.leads.servico_origem_id IS 'Serviço específico que originou a oportunidade deste lead';


-- === 20251208173416_91bf37b1-51f6-4602-95fe-80f4287a5c4f.sql ===
-- Enable realtime for leads table to allow real-time status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- === 20251208173924_841c8c66-9e13-4342-9137-8cb16ed23a8b.sql ===
-- Add policy to allow authenticated users to update lead status
DROP POLICY IF EXISTS "Authenticated users can update lead status" ON public.leads;
CREATE POLICY "Authenticated users can update lead status"
ON public.leads
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- === 20251208175022_360e975c-e2f9-44a8-978c-bd74840685ed.sql ===
-- Add new event types to track all lead status changes
-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'status_alterado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'enviado_acompanhamento'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_criado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_editado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_qualificado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'em_resposta'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;

-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_descartado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251208175403_b141e099-1377-4664-8536-4823a3f030a1.sql ===
-- Allow all authenticated users to insert lead history entries
-- This is needed for proper lead lifecycle tracking

-- Drop the restrictive insert policy
DROP POLICY IF EXISTS "Usuários autorizados podem inserir histórico de leads" ON public.lead_historico;

-- Create a more permissive policy for INSERT that allows any authenticated user
DROP POLICY IF EXISTS "Authenticated users can insert lead history" ON public.lead_historico;
CREATE POLICY "Authenticated users can insert lead history"
ON public.lead_historico
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- === 20251208175540_1c3f081d-8f65-4438-a282-f59559fbea6b.sql ===
-- Drop the old constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add updated constraint with all status values
DO $ac$ BEGIN ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
CHECK (status = ANY (ARRAY[
  'Novo'::text, 
  'Qualificado'::text, 
  'Convertido'::text, 
  'Descartado'::text,
  'Acompanhamento'::text,
  'Em Resposta'::text,
  'Proposta Enviada'::text,
  'Proposta Aceita'::text,
  'Proposta Recusada'::text
])); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;

-- === 20251208185305_68a2416b-8a55-433b-b11b-f297566ecb85.sql ===
-- Add missing fields to leads table to match medicos kanban card structure
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS cpf text,
ADD COLUMN IF NOT EXISTS crm text,
ADD COLUMN IF NOT EXISTS data_nascimento date;

-- === 20251208185936_dcf6406d-d3b9-4906-8617-2548d4513214.sql ===
-- Remove a constraint fixa de status
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Criar função para validar status dinamicamente
CREATE OR REPLACE FUNCTION public.validate_lead_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Permite qualquer status que exista na tabela kanban_status_config para módulo 'disparos' ou 'leads'
  IF NOT EXISTS (
    SELECT 1 FROM public.kanban_status_config 
    WHERE (modulo = 'disparos' OR modulo = 'leads') 
    AND (status_id = NEW.status OR label = NEW.status)
    AND ativo = true
  ) THEN
    -- Também permite status padrões
    IF NEW.status NOT IN ('Novo', 'Qualificado', 'Convertido', 'Descartado', 'Acompanhamento') THEN
      RAISE EXCEPTION 'Status "%" não é válido. Adicione-o primeiro na configuração do Kanban.', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para validação
DROP TRIGGER IF EXISTS validate_lead_status_trigger ON public.leads;
DROP TRIGGER IF EXISTS "validate_lead_status_trigger" ON public.leads;
CREATE TRIGGER validate_lead_status_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lead_status();

-- Habilitar realtime para leads
ALTER TABLE public.leads REPLICA IDENTITY FULL;

-- Adicionar leads ao supabase_realtime se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

-- Habilitar realtime para kanban_status_config
ALTER TABLE public.kanban_status_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'kanban_status_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_status_config;
  END IF;
END $$;

-- === 20251209111201_772a205b-d209-42c1-b69f-c21d84a7430b.sql ===
-- Add comprehensive lead fields for complete lead profile
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS rqe text,
ADD COLUMN IF NOT EXISTS nacionalidade text,
ADD COLUMN IF NOT EXISTS naturalidade text,
ADD COLUMN IF NOT EXISTS estado_civil text,
ADD COLUMN IF NOT EXISTS rg text,
ADD COLUMN IF NOT EXISTS endereco text,
ADD COLUMN IF NOT EXISTS cep text,
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS banco text,
ADD COLUMN IF NOT EXISTS agencia text,
ADD COLUMN IF NOT EXISTS conta_corrente text,
ADD COLUMN IF NOT EXISTS chave_pix text,
ADD COLUMN IF NOT EXISTS modalidade_contrato text,
ADD COLUMN IF NOT EXISTS local_prestacao_servico text,
ADD COLUMN IF NOT EXISTS data_inicio_contrato date,
ADD COLUMN IF NOT EXISTS valor_contrato numeric,
ADD COLUMN IF NOT EXISTS especificacoes_contrato text;

-- === 20251209112004_df31a549-b366-4dbe-bcb2-33f5fe85a969.sql ===
-- Add additional phones field to support up to 5 contacts
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS telefones_adicionais text[] DEFAULT '{}';

-- === 20251209112428_ad581878-7b28-46ff-8428-8a59305e99c9.sql ===
-- Create table for lead attachments
CREATE TABLE IF NOT EXISTS public.lead_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_tipo TEXT,
  arquivo_tamanho INTEGER,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_anexos ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Authenticated users can view lead attachments" ON public.lead_anexos;
CREATE POLICY "Authenticated users can view lead attachments"
ON public.lead_anexos FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert lead attachments" ON public.lead_anexos;
CREATE POLICY "Authenticated users can insert lead attachments"
ON public.lead_anexos FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete lead attachments" ON public.lead_anexos;
CREATE POLICY "Authenticated users can delete lead attachments"
ON public.lead_anexos FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create storage bucket for lead attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-anexos', 'lead-anexos', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Authenticated users can view lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view lead attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can upload lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete lead attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'lead-anexos' AND auth.uid() IS NOT NULL);

-- === 20251209114643_0457fbab-c62a-4397-b48b-b39a93e6a1ea.sql ===
-- Migrar medico_kanban_cards para leads
-- 1. Inserir leads a partir dos cards existentes
INSERT INTO public.leads (
  nome,
  phone_e164,
  cpf,
  crm,
  email,
  observacoes,
  data_nascimento,
  status,
  origem,
  created_at,
  updated_at
)
SELECT 
  mkc.nome,
  COALESCE(
    CASE 
      WHEN mkc.telefone ~ '^\+' THEN mkc.telefone
      WHEN mkc.telefone IS NOT NULL AND mkc.telefone != '' THEN 
        '+55' || regexp_replace(mkc.telefone, '[^0-9]', '', 'g')
      ELSE '+55' || RIGHT(gen_random_uuid()::text, 11)
    END,
    '+55' || RIGHT(gen_random_uuid()::text, 11)
  ) as phone_e164,
  mkc.cpf,
  mkc.crm,
  mkc.email,
  mkc.observacoes,
  mkc.data_nascimento,
  'Convertido' as status,
  'Kanban Médicos (migrado)' as origem,
  mkc.created_at,
  mkc.updated_at
FROM medico_kanban_cards mkc
WHERE NOT EXISTS (
  SELECT 1 FROM leads l WHERE l.email = mkc.email AND mkc.email IS NOT NULL
);

-- 2. Adicionar coluna medico_kanban_card_id na tabela leads para rastreabilidade (temporária)
-- Não vamos adicionar nova coluna, apenas usar a origem

-- 3. Atualizar view ou adicionar comentário sobre regra de disparos
-- A regra será implementada no código: leads com status 'Convertido' não aparecem em disparos

COMMENT ON TABLE public.leads IS 'Leads de captação médica. Leads com status Convertido não devem ser incluídos em disparos.';

-- === 20251209114843_0c27c2c6-1c20-4961-b22b-62b884c54ae6.sql ===
-- Migrar anexos de medico_kanban_cards para lead_anexos
-- Os arquivos permanecem no storage medico-kanban-anexos, apenas criamos referência na lead_anexos

INSERT INTO public.lead_anexos (
  lead_id,
  arquivo_nome,
  arquivo_url,
  usuario_id,
  usuario_nome,
  created_at
)
SELECT 
  l.id as lead_id,
  mka.arquivo_nome,
  'medico-kanban-anexos/' || mka.arquivo_url as arquivo_url,
  mka.usuario_id,
  mka.usuario_nome,
  mka.created_at
FROM medico_kanban_card_anexos mka
JOIN medico_kanban_cards mkc ON mkc.id = mka.card_id
JOIN leads l ON l.email = mkc.email
WHERE l.origem = 'Kanban Médicos (migrado)'
AND NOT EXISTS (
  SELECT 1 FROM lead_anexos la 
  WHERE la.lead_id = l.id 
  AND la.arquivo_nome = mka.arquivo_nome
);

-- === 20251209171745_fe2a5b28-5ae7-4180-b483-d7b24b2a4b8c.sql ===
-- Drop the restrictive update policy and create a more permissive one for authenticated users
DROP POLICY IF EXISTS "Authenticated users can update lead status" ON public.leads;

-- Create policy that allows any authenticated user to update leads (for those with module access)
DROP POLICY IF EXISTS "Authenticated users can update leads" ON public.leads;
CREATE POLICY "Authenticated users can update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow authenticated users to SELECT leads (needed to edit them)
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
CREATE POLICY "Authenticated users can view leads"
ON public.leads
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- === 20251209172228_9fab5640-a4bd-4aca-8c04-fc9b369494cf.sql ===
-- Add responsavel_id to conversas table for assigning operators
ALTER TABLE public.conversas 
ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add status field for conversation tracking
ALTER TABLE public.conversas 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto';

-- === 20251209174829_05a8b359-cd42-449c-815d-c1fb88135783.sql ===

-- =============================================
-- SIGZAP - MODELAGEM COMPLETA PARA EVOLUTION API
-- =============================================

-- 1. Tabela de Instâncias WhatsApp
CREATE TABLE IF NOT EXISTS public.sigzap_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instance_uuid TEXT UNIQUE,
  phone_number TEXT,
  status TEXT DEFAULT 'disconnected', -- connected, disconnected, connecting
  profile_name TEXT,
  profile_picture_url TEXT,
  chip_id UUID REFERENCES public.chips(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Contatos
CREATE TABLE IF NOT EXISTS public.sigzap_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_jid TEXT NOT NULL, -- ex: 5511999999999@s.whatsapp.net
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  profile_picture_url TEXT,
  instance_id UUID REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_jid, instance_id)
);

-- 3. Tabela de Conversas
CREATE TABLE IF NOT EXISTS public.sigzap_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.sigzap_contacts(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER DEFAULT 0,
  assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'open', -- open, in_progress, closed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_id, instance_id)
);

-- 4. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS public.sigzap_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sigzap_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  from_me BOOLEAN DEFAULT false,
  sender_jid TEXT,
  message_text TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, video, audio, document, sticker, location, contact, unknown
  message_status TEXT, -- pending, sent, delivered, read, failed
  raw_payload JSONB,
  media_storage_path TEXT,
  media_mime_type TEXT,
  media_caption TEXT,
  media_filename TEXT,
  media_url TEXT,
  quoted_message_id TEXT,
  quoted_message_text TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Tabela de Eventos (logs gerais da Evolution)
CREATE TABLE IF NOT EXISTS public.sigzap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sigzap_contacts_instance ON public.sigzap_contacts(instance_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_contacts_jid ON public.sigzap_contacts(contact_jid);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_instance ON public.sigzap_conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_assigned ON public.sigzap_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_status ON public.sigzap_conversations(status);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_conversation ON public.sigzap_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_sent_at ON public.sigzap_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_wa_id ON public.sigzap_messages(wa_message_id);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION public.update_sigzap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS "update_sigzap_instances_updated_at" ON public.sigzap_instances;
CREATE TRIGGER update_sigzap_instances_updated_at
  BEFORE UPDATE ON public.sigzap_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

DROP TRIGGER IF EXISTS "update_sigzap_contacts_updated_at" ON public.sigzap_contacts;
CREATE TRIGGER update_sigzap_contacts_updated_at
  BEFORE UPDATE ON public.sigzap_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

DROP TRIGGER IF EXISTS "update_sigzap_conversations_updated_at" ON public.sigzap_conversations;
CREATE TRIGGER update_sigzap_conversations_updated_at
  BEFORE UPDATE ON public.sigzap_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

-- RLS Policies
ALTER TABLE public.sigzap_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_events ENABLE ROW LEVEL SECURITY;

-- Políticas para sigzap_instances
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar instâncias" ON public.sigzap_instances;
CREATE POLICY "Usuários autenticados podem visualizar instâncias"
  ON public.sigzap_instances FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins podem gerenciar instâncias" ON public.sigzap_instances;
CREATE POLICY "Admins podem gerenciar instâncias"
  ON public.sigzap_instances FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

-- Políticas para sigzap_contacts
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contatos" ON public.sigzap_contacts;
CREATE POLICY "Usuários autenticados podem visualizar contatos"
  ON public.sigzap_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Sistema pode gerenciar contatos" ON public.sigzap_contacts;
CREATE POLICY "Sistema pode gerenciar contatos"
  ON public.sigzap_contacts FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

-- Políticas para sigzap_conversations
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar conversas" ON public.sigzap_conversations;
CREATE POLICY "Usuários autenticados podem visualizar conversas"
  ON public.sigzap_conversations FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar conversas" ON public.sigzap_conversations;
CREATE POLICY "Usuários autenticados podem atualizar conversas"
  ON public.sigzap_conversations FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Sistema pode inserir conversas" ON public.sigzap_conversations;
CREATE POLICY "Sistema pode inserir conversas"
  ON public.sigzap_conversations FOR INSERT
  WITH CHECK (true);

-- Políticas para sigzap_messages
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar mensagens" ON public.sigzap_messages;
CREATE POLICY "Usuários autenticados podem visualizar mensagens"
  ON public.sigzap_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir mensagens" ON public.sigzap_messages;
CREATE POLICY "Usuários autenticados podem inserir mensagens"
  ON public.sigzap_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Sistema pode inserir mensagens" ON public.sigzap_messages;
CREATE POLICY "Sistema pode inserir mensagens"
  ON public.sigzap_messages FOR INSERT
  WITH CHECK (true);

-- Políticas para sigzap_events
DROP POLICY IF EXISTS "Admins podem visualizar eventos" ON public.sigzap_events;
CREATE POLICY "Admins podem visualizar eventos"
  ON public.sigzap_events FOR SELECT
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Sistema pode inserir eventos" ON public.sigzap_events;
CREATE POLICY "Sistema pode inserir eventos"
  ON public.sigzap_events FOR INSERT
  WITH CHECK (true);

-- Habilitar Realtime para as tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE public.sigzap_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sigzap_messages;

-- Storage bucket para mídia
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sigzap-media',
  'sigzap-media',
  false,
  52428800, -- 50MB
  ARRAY['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para sigzap-media
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar mídia sigzap" ON storage.objects;
CREATE POLICY "Usuários autenticados podem visualizar mídia sigzap"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sigzap-media' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Sistema pode inserir mídia sigzap" ON storage.objects;
CREATE POLICY "Sistema pode inserir mídia sigzap"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sigzap-media');

DROP POLICY IF EXISTS "Admins podem gerenciar mídia sigzap" ON storage.objects;
CREATE POLICY "Admins podem gerenciar mídia sigzap"
  ON storage.objects FOR ALL
  USING (bucket_id = 'sigzap-media' AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao')));

-- Migrar dados existentes de chips para sigzap_instances
INSERT INTO public.sigzap_instances (name, instance_uuid, phone_number, status, profile_name, profile_picture_url, chip_id)
SELECT 
  nome,
  instance_id,
  numero,
  CASE WHEN connection_state = 'open' THEN 'connected' ELSE 'disconnected' END,
  profile_name,
  profile_picture_url,
  id
FROM public.chips
WHERE instance_id IS NOT NULL
ON CONFLICT DO NOTHING;