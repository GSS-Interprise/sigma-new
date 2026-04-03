
-- === 20251218163735_9e2d6301-5b85-401e-ab1b-6f253c64b925.sql ===
-- Adicionar campo tipo_licitacao para distinguir licitações GSS vs AGES
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS tipo_licitacao TEXT DEFAULT 'GSS' CHECK (tipo_licitacao IN ('GSS', 'AGES'));

-- Criar índice para filtros por tipo
CREATE INDEX IF NOT EXISTS idx_licitacoes_tipo_licitacao ON public.licitacoes(tipo_licitacao);

-- === 20251218174741_0f535efa-3cb3-4dc6-a5c6-7d29342d94e4.sql ===
-- Add prioridade column to licitacoes table
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT NULL;

-- === 20251219121419_44ec1a74-51a5-4741-a208-65a6e5310c5a.sql ===
-- Add UPDATE policy for comunicacao_mensagens to allow users to edit their own messages
DROP POLICY IF EXISTS "Users can update their own messages" ON public.comunicacao_mensagens;
CREATE POLICY "Users can update their own messages" 
ON public.comunicacao_mensagens 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- === 20251219122823_6d7e2502-0cbb-4b2f-b1ba-0711a159e4c5.sql ===
-- Criar tabela para armazenar configuração global de etiquetas de licitações
CREATE TABLE IF NOT EXISTS public.licitacoes_etiquetas_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  cor_id TEXT NOT NULL DEFAULT 'gray',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.licitacoes_etiquetas_config ENABLE ROW LEVEL SECURITY;

-- Política para visualização - usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar etiquetas" ON public.licitacoes_etiquetas_config;
CREATE POLICY "Usuários autenticados podem visualizar etiquetas" 
ON public.licitacoes_etiquetas_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Política para gerenciamento - gestores
DROP POLICY IF EXISTS "Gestores podem gerenciar etiquetas" ON public.licitacoes_etiquetas_config;
CREATE POLICY "Gestores podem gerenciar etiquetas" 
ON public.licitacoes_etiquetas_config 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'lideres'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'lideres'::app_role));

-- Inserir etiquetas padrão
INSERT INTO public.licitacoes_etiquetas_config (nome, cor_id) VALUES
  ('Saúde', 'teal'),
  ('Radiologia', 'purple'),
  ('Urgente', 'red'),
  ('Prioritário', 'orange'),
  ('Médico', 'blue'),
  ('Equipamento', 'green'),
  ('Análise Técnica', 'yellow'),
  ('Documentação', 'gray');

-- === 20251222195011_dd01ac85-fbb8-49cc-9d00-7dd07ef10663.sql ===
-- Adicionar novo valor ao enum tipo_evento_lead
-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'desconvertido_para_lead'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251223143019_815a9e5d-3e97-4b59-bdf7-31e5a277c2fc.sql ===
-- Etapa 1: Adicionar novos campos para suportar layout V2
-- Mantendo retrocompatibilidade total com layout V1

-- Novos campos para o layout V2
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS cod_acesso TEXT,
ADD COLUMN IF NOT EXISTS sla TEXT,
ADD COLUMN IF NOT EXISTS sla_horas INTEGER,
ADD COLUMN IF NOT EXISTS medico_atribuido_id UUID REFERENCES public.medicos(id),
ADD COLUMN IF NOT EXISTS medico_atribuido_nome TEXT,
ADD COLUMN IF NOT EXISTS medico_finalizador_id UUID REFERENCES public.medicos(id),
ADD COLUMN IF NOT EXISTS data_final TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS layout_versao TEXT DEFAULT 'v1';

-- Índice para cod_acesso (campo chave do novo layout)
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_cod_acesso 
ON public.radiologia_pendencias(cod_acesso);

-- Comentários de documentação
COMMENT ON COLUMN radiologia_pendencias.sla IS 'Tipo SLA do layout V2: Atendimento Ambulatorial (48h), Internado (4h), Pronto Socorro (2h), Alta (2h)';
COMMENT ON COLUMN radiologia_pendencias.sla_horas IS 'Horas do SLA calculadas automaticamente';
COMMENT ON COLUMN radiologia_pendencias.medico_atribuido_id IS 'Médico atribuído (do campo atribuido do layout V2)';
COMMENT ON COLUMN radiologia_pendencias.medico_atribuido_nome IS 'Nome do médico atribuído (fallback quando ID não encontrado)';
COMMENT ON COLUMN radiologia_pendencias.layout_versao IS 'Versão do layout usado na importação: v1 (antigo) ou v2 (novo)';
COMMENT ON COLUMN radiologia_pendencias.nivel_urgencia IS 'DEPRECATED: Use sla + sla_horas para novos registros';
COMMENT ON COLUMN radiologia_pendencias.tipo_registro IS 'DEPRECATED: Layout v2 não utiliza este campo';

-- Backfill: Popular novos campos a partir dos dados existentes
UPDATE public.radiologia_pendencias SET
  sla = CASE nivel_urgencia
    WHEN 'pronto_socorro' THEN 'Pronto Socorro'
    WHEN 'internados' THEN 'Internado'
    WHEN 'oncologicos' THEN 'Atendimento Ambulatorial'
    ELSE 'Internado'
  END,
  sla_horas = CASE nivel_urgencia
    WHEN 'pronto_socorro' THEN 2
    WHEN 'internados' THEN 4
    WHEN 'oncologicos' THEN 48
    ELSE 4
  END,
  cod_acesso = acesso,
  medico_atribuido_id = medico_id,
  layout_versao = 'v1'
WHERE layout_versao IS NULL OR sla IS NULL;

-- === 20251223194449_1022a7ca-8621-4a9f-832b-309f281062ae.sql ===
-- Adicionar coluna para ignorar pendências
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS ignorada BOOLEAN DEFAULT false;

-- Adicionar coluna para motivo da ignorância
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS motivo_ignorar TEXT;

-- === 20251229121958_8dd7a7e5-d2b1-448d-b5cf-ebc8e504e95e.sql ===
-- Adicionar campos para vincular ajustes às pendências importadas
ALTER TABLE radiologia_ajuste_laudos
ADD COLUMN IF NOT EXISTS pendencia_id UUID REFERENCES radiologia_pendencias(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS nome_paciente TEXT,
ADD COLUMN IF NOT EXISTS cod_acesso TEXT;

-- Índice para busca por pendência
CREATE INDEX IF NOT EXISTS idx_radiologia_ajuste_laudos_pendencia_id ON radiologia_ajuste_laudos(pendencia_id);

-- Índice para busca por código de acesso
CREATE INDEX IF NOT EXISTS idx_radiologia_ajuste_laudos_cod_acesso ON radiologia_ajuste_laudos(cod_acesso);

-- === 20251229130630_49bb4291-54aa-4e2e-b371-9003aa88d64e.sql ===
-- Atualizar política de SELECT em clientes para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;

DROP POLICY IF EXISTS "Usuarios autorizados podem visualizar clientes" ON public.clientes;
CREATE POLICY "Usuarios autorizados podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- Atualizar política de SELECT em unidades para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar unidades" ON public.unidades;

DROP POLICY IF EXISTS "Usuarios autorizados podem visualizar unidades" ON public.unidades;
CREATE POLICY "Usuarios autorizados podem visualizar unidades"
ON public.unidades
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- === 20251229141828_4c938ec3-27a0-45d4-b301-cc95fb0252e0.sql ===
-- Tabela de histórico de imports
CREATE TABLE IF NOT EXISTS public.radiologia_imports_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  registros_novos INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de snapshots (dados antes da atualização)
CREATE TABLE IF NOT EXISTS public.radiologia_pendencias_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.radiologia_imports_historico(id) ON DELETE CASCADE,
  pendencia_id UUID NOT NULL,
  dados_anteriores JSONB NOT NULL,
  tipo_operacao TEXT NOT NULL CHECK (tipo_operacao IN ('insert', 'update')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_imports_historico_cliente ON public.radiologia_imports_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_imports_historico_created ON public.radiologia_imports_historico(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_import ON public.radiologia_pendencias_snapshots(import_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_pendencia ON public.radiologia_pendencias_snapshots(pendencia_id);

-- RLS
ALTER TABLE public.radiologia_imports_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_pendencias_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas para imports_historico
DROP POLICY IF EXISTS "Authenticated users can view radiologia_imports_historico" ON public.radiologia_imports_historico;
CREATE POLICY "Authenticated users can view radiologia_imports_historico"
ON public.radiologia_imports_historico FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage radiologia_imports_historico" ON public.radiologia_imports_historico;
CREATE POLICY "Authorized users can manage radiologia_imports_historico"
ON public.radiologia_imports_historico FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_radiologia') OR has_role(auth.uid(), 'gestor_contratos'));

-- Políticas para snapshots
DROP POLICY IF EXISTS "Authenticated users can view radiologia_pendencias_snapshots" ON public.radiologia_pendencias_snapshots;
CREATE POLICY "Authenticated users can view radiologia_pendencias_snapshots"
ON public.radiologia_pendencias_snapshots FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage radiologia_pendencias_snapshots" ON public.radiologia_pendencias_snapshots;
CREATE POLICY "Authorized users can manage radiologia_pendencias_snapshots"
ON public.radiologia_pendencias_snapshots FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_radiologia') OR has_role(auth.uid(), 'gestor_contratos'));

-- === 20251229180131_396f5335-e758-41ab-8996-3351ec6ccbf8.sql ===
-- Primeiro: Adicionar o novo role ao enum
-- MOVED TO chunk_pre.sql: DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_ages'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251229180210_440681d8-7cdb-4a29-8605-06dc99048ee8.sql ===
-- 1. Atualizar política da tabela ages_profissionais para incluir gestor_ages
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais" ON public.ages_profissionais;
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais" ON public.ages_profissionais;
CREATE POLICY "Authorized users can manage ages_profissionais" 
ON public.ages_profissionais 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 2. Atualizar política da tabela ages_profissionais_documentos
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos;
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos;
CREATE POLICY "Authorized users can manage ages_profissionais_documentos" 
ON public.ages_profissionais_documentos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 3. Atualizar política da tabela ages_contratos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
CREATE POLICY "Authorized users can manage ages_contratos" 
ON public.ages_contratos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 4. Atualizar política da tabela ages_producao
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
CREATE POLICY "Authorized users can manage ages_producao" 
ON public.ages_producao 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 5. Atualizar política da tabela ages_licitacoes
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
CREATE POLICY "Authorized users can manage ages_licitacoes" 
ON public.ages_licitacoes 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 6. Atualizar política da tabela ages_leads
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
CREATE POLICY "Authorized users can manage ages_leads" 
ON public.ages_leads 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 7. Atualizar política da tabela ages_contratos_documentos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos_documentos" ON public.ages_contratos_documentos;
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authorized users can manage ages_contratos_documentos" 
ON public.ages_contratos_documentos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- === 20251230160429_72508512-7fd5-4159-b0c9-b20b22cc6a5d.sql ===
-- Tabela de contratos Dr. Escala (estrutura igual a contratos)
CREATE TABLE IF NOT EXISTS public.contratos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contratos Dr. Oportunidade (estrutura igual a contratos)
CREATE TABLE IF NOT EXISTS public.contratos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_anexos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_anexos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_aditivos_tempo_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_aditivos_tempo_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contratos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- Policies para usuários autenticados
DROP POLICY IF EXISTS "Authenticated users can view contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can view contratos_dr_escala" ON public.contratos_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can insert contratos_dr_escala" ON public.contratos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can update contratos_dr_escala" ON public.contratos_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can delete contratos_dr_escala" ON public.contratos_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can view contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can update contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can view contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can update contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can view contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can update contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_contratos_dr_escala_updated_at" ON public.contratos_dr_escala;
CREATE TRIGGER update_contratos_dr_escala_updated_at BEFORE UPDATE ON public.contratos_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_contratos_dr_oportunidade_updated_at" ON public.contratos_dr_oportunidade;
CREATE TRIGGER update_contratos_dr_oportunidade_updated_at BEFORE UPDATE ON public.contratos_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_contrato_aditivos_tempo_dr_escala_updated_at" ON public.contrato_aditivos_tempo_dr_escala;
CREATE TRIGGER update_contrato_aditivos_tempo_dr_escala_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_contrato_aditivos_tempo_dr_oportunidade_updated_at" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE TRIGGER update_contrato_aditivos_tempo_dr_oportunidade_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251230161602_b6c28f81-58ee-4759-bb62-8876580d7c0f.sql ===
-- Criar tabela de itens para Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_itens_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de itens para Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_itens_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contrato_itens_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_itens_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- RLS Policies para itens Dr. Escala
DROP POLICY IF EXISTS "Authenticated users can view itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can view itens dr escala" 
ON public.contrato_itens_dr_escala FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can insert itens dr escala" 
ON public.contrato_itens_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can update itens dr escala" 
ON public.contrato_itens_dr_escala FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can delete itens dr escala" 
ON public.contrato_itens_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para itens Dr. Oportunidade
DROP POLICY IF EXISTS "Authenticated users can view itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can view itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can insert itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can update itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can delete itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Escala
DROP POLICY IF EXISTS "Authenticated users can view renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can view renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can insert renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can update renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can delete renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Oportunidade
DROP POLICY IF EXISTS "Authenticated users can view renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can view renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can insert renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can update renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can delete renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- === 20251230170734_3812e1fd-452c-4d30-a3eb-f40548913748.sql ===
-- Função para remover automaticamente o card do Kanban quando os 3 campos de aprovação forem marcados
CREATE OR REPLACE FUNCTION public.auto_remove_kanban_card_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Se todas as 3 aprovações estão marcadas como true
  IF NEW.aprovacao_contrato_assinado = true 
     AND NEW.aprovacao_documentacao_unidade = true 
     AND NEW.aprovacao_cadastro_unidade = true THEN
    -- Deleta o card do kanban vinculado a este médico
    DELETE FROM public.medico_kanban_cards 
    WHERE medico_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que executa após UPDATE na tabela medicos
DROP TRIGGER IF EXISTS "trigger_remove_kanban_on_approval" ON public.medicos;
CREATE TRIGGER trigger_remove_kanban_on_approval
  AFTER UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_remove_kanban_card_on_approval();

-- Limpar cards órfãos existentes (médicos já aprovados que ainda estão no Kanban)
DELETE FROM public.medico_kanban_cards 
WHERE medico_id IN (
  SELECT m.id FROM public.medicos m
  WHERE m.aprovacao_contrato_assinado = true
    AND m.aprovacao_documentacao_unidade = true
    AND m.aprovacao_cadastro_unidade = true
);

-- === 20251230173522_88d75721-d8d7-4747-b8d5-01f2059c8b43.sql ===
-- Permitir que lideres, gestor_contratos e gestor_captacao gerenciem config_lista_items
DROP POLICY IF EXISTS "Gestores and lideres can manage config_lista_items" ON public.config_lista_items;
CREATE POLICY "Gestores and lideres can manage config_lista_items"
ON public.config_lista_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
)
WITH CHECK (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
);

-- === 20260102140501_f7963732-ce84-4d6c-8493-bea61c679913.sql ===
-- =============================================
-- FASE 1: Tabelas para Clientes e Unidades AGES
-- =============================================

-- 1.1 Criar tabela ages_clientes
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

-- 1.2 Criar tabela ages_unidades
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

-- 1.3 Adicionar novas colunas em ages_contratos para referenciar ages_clientes e ages_unidades
-- Primeiro, adicionar as novas colunas
ALTER TABLE public.ages_contratos 
  ADD COLUMN IF NOT EXISTS ages_cliente_id UUID REFERENCES public.ages_clientes(id),
  ADD COLUMN IF NOT EXISTS ages_unidade_id UUID REFERENCES public.ages_unidades(id);

-- 1.4 Habilitar RLS
ALTER TABLE public.ages_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_unidades ENABLE ROW LEVEL SECURITY;

-- 1.5 Políticas RLS para ages_clientes
DROP POLICY IF EXISTS "Authenticated users can view ages_clientes" ON public.ages_clientes;
CREATE POLICY "Authenticated users can view ages_clientes"
  ON public.ages_clientes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_clientes" ON public.ages_clientes;
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
DROP POLICY IF EXISTS "Authenticated users can view ages_unidades" ON public.ages_unidades;
CREATE POLICY "Authenticated users can view ages_unidades"
  ON public.ages_unidades
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_unidades" ON public.ages_unidades;
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
DROP TRIGGER IF EXISTS "update_ages_clientes_updated_at" ON public.ages_clientes;
CREATE TRIGGER update_ages_clientes_updated_at
  BEFORE UPDATE ON public.ages_clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.8 Trigger para updated_at em ages_unidades
DROP TRIGGER IF EXISTS "update_ages_unidades_updated_at" ON public.ages_unidades;
CREATE TRIGGER update_ages_unidades_updated_at
  BEFORE UPDATE ON public.ages_unidades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.9 Índices para performance
CREATE INDEX IF NOT EXISTS idx_ages_clientes_status ON public.ages_clientes(status_cliente);
CREATE INDEX IF NOT EXISTS idx_ages_clientes_uf ON public.ages_clientes(uf);
CREATE INDEX IF NOT EXISTS idx_ages_unidades_cliente ON public.ages_unidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_contratos_ages_cliente ON public.ages_contratos(ages_cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_contratos_ages_unidade ON public.ages_contratos(ages_unidade_id);

-- === 20260102145941_a8e4317e-2ec4-45a9-b80f-7c2b4aefc1cf.sql ===
-- Adicionar mais campos ao ages_leads para ficar igual ao GSS
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS registro_profissional TEXT,
ADD COLUMN IF NOT EXISTS banco TEXT,
ADD COLUMN IF NOT EXISTS agencia TEXT,
ADD COLUMN IF NOT EXISTS conta_corrente TEXT,
ADD COLUMN IF NOT EXISTS chave_pix TEXT,
ADD COLUMN IF NOT EXISTS telefones_adicionais TEXT[],
ADD COLUMN IF NOT EXISTS modalidade_contrato TEXT,
ADD COLUMN IF NOT EXISTS local_prestacao_servico TEXT,
ADD COLUMN IF NOT EXISTS data_inicio_contrato DATE,
ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC,
ADD COLUMN IF NOT EXISTS especificacoes_contrato TEXT;

-- Criar tabela de histórico para ages_leads
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

-- Criar tabela de anexos para ages_leads
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

-- Enable RLS
ALTER TABLE public.ages_lead_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_lead_anexos ENABLE ROW LEVEL SECURITY;

-- Policies para histórico
DROP POLICY IF EXISTS "Users can view ages lead historico" ON public.ages_lead_historico;
CREATE POLICY "Users can view ages lead historico" 
ON public.ages_lead_historico 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can insert ages lead historico" ON public.ages_lead_historico;
CREATE POLICY "Users can insert ages lead historico" 
ON public.ages_lead_historico 
FOR INSERT 
WITH CHECK (true);

-- Policies para anexos
DROP POLICY IF EXISTS "Users can view ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can view ages lead anexos" 
ON public.ages_lead_anexos 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can insert ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can insert ages lead anexos" 
ON public.ages_lead_anexos 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can update ages lead anexos" 
ON public.ages_lead_anexos 
FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Users can delete ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can delete ages lead anexos" 
ON public.ages_lead_anexos 
FOR DELETE 
USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ages_lead_historico_lead_id ON public.ages_lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_anexos_lead_id ON public.ages_lead_anexos(lead_id);

-- === 20260102171234_5e8ab19e-41ae-43a7-a616-4270adbb9a04.sql ===
-- Tornar o bucket ages-documentos público para permitir uploads
UPDATE storage.buckets 
SET public = true 
WHERE id = 'ages-documentos';

-- Criar política de upload se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir upload ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir upload ages-documentos" ON storage.objects;
CREATE POLICY "Permitir upload ages-documentos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Criar política de leitura pública se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir leitura ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir leitura ages-documentos" ON storage.objects;
CREATE POLICY "Permitir leitura ages-documentos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'ages-documentos');
  END IF;
END $$;

-- Criar política de delete se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir delete ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir delete ages-documentos" ON storage.objects;
CREATE POLICY "Permitir delete ages-documentos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- === 20260102172924_2d9ecf95-0402-4621-aebb-222a98e88bb7.sql ===
-- Adicionar campo unidades_vinculadas ao ages_leads
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS unidades_vinculadas uuid[] DEFAULT '{}'::uuid[];

-- Criar tabela de propostas AGES
CREATE TABLE IF NOT EXISTS public.ages_propostas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.ages_profissionais(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.ages_clientes(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.ages_unidades(id) ON DELETE SET NULL,
  contrato_id uuid REFERENCES public.ages_contratos(id) ON DELETE SET NULL,
  valor numeric,
  status text NOT NULL DEFAULT 'rascunho',
  observacoes text,
  descricao text,
  id_proposta text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_propostas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view ages_propostas" ON public.ages_propostas;
CREATE POLICY "Authenticated users can view ages_propostas"
ON public.ages_propostas FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_propostas" ON public.ages_propostas;
CREATE POLICY "Authorized users can manage ages_propostas"
ON public.ages_propostas FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_ages')
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_ages_propostas_updated_at" ON public.ages_propostas;
CREATE TRIGGER update_ages_propostas_updated_at
  BEFORE UPDATE ON public.ages_propostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20260102191409_4e500cd0-d9cd-4301-a213-ab7c6557e597.sql ===

-- Tabela para armazenar contas/perfis de marketing
CREATE TABLE IF NOT EXISTS public.marketing_contas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.marketing_contas ENABLE ROW LEVEL SECURITY;

-- Política para visualização
DROP POLICY IF EXISTS "Authenticated users can view marketing_contas" ON public.marketing_contas;
CREATE POLICY "Authenticated users can view marketing_contas"
ON public.marketing_contas
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciamento
DROP POLICY IF EXISTS "Authorized users can manage marketing_contas" ON public.marketing_contas;
CREATE POLICY "Authorized users can manage marketing_contas"
ON public.marketing_contas
FOR ALL
USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR 
    has_role(auth.uid(), 'diretoria'::app_role)
);

-- Alterar coluna conta_perfil para permitir null
DO $altc$ BEGIN ALTER TABLE public.marketing_conteudos 
ALTER COLUMN conta_perfil DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;


-- === 20260102194559_779f2c2f-7cc7-4bdd-b749-652669bc708b.sql ===

-- Adicionar colunas faltantes na tabela ages_contratos
ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS assinado text DEFAULT 'Pendente',
ADD COLUMN IF NOT EXISTS motivo_pendente text,
ADD COLUMN IF NOT EXISTS prazo_meses integer,
ADD COLUMN IF NOT EXISTS codigo_interno integer;

-- Criar sequência para codigo_interno em ages_contratos
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;

-- Definir default para codigo_interno usando a sequência
DO $altc$ BEGIN ALTER TABLE public.ages_contratos 
ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq'); EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

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