
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
DO $$ BEGIN ALTER TABLE public.marketing_conteudos 
ALTER COLUMN conta_perfil DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;


-- === 20260102194559_779f2c2f-7cc7-4bdd-b749-652669bc708b.sql ===

-- Adicionar colunas faltantes na tabela ages_contratos
DO $$ BEGIN ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS assinado text DEFAULT 'Pendente',
ADD COLUMN IF NOT EXISTS motivo_pendente text,
ADD COLUMN IF NOT EXISTS prazo_meses integer,
ADD COLUMN IF NOT EXISTS codigo_interno integer; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar sequência para codigo_interno em ages_contratos
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;

-- Definir default para codigo_interno usando a sequência
DO $$ BEGIN ALTER TABLE public.ages_contratos 
ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq'); EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

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
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_itens" ON public.ages_contrato_itens;
CREATE POLICY "Authenticated users can view ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_itens" ON public.ages_contrato_itens;
CREATE POLICY "Authorized users can manage ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_renovacoes
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_renovacoes" ON public.ages_contrato_renovacoes;
CREATE POLICY "Authenticated users can view ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_renovacoes" ON public.ages_contrato_renovacoes;
CREATE POLICY "Authorized users can manage ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_aditivos
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_aditivos" ON public.ages_contrato_aditivos;
CREATE POLICY "Authenticated users can view ages_contrato_aditivos" 
ON public.ages_contrato_aditivos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_aditivos" ON public.ages_contrato_aditivos;
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

DROP TRIGGER IF EXISTS "update_ages_contrato_itens_updated_at" ON public.ages_contrato_itens;
CREATE TRIGGER update_ages_contrato_itens_updated_at
BEFORE UPDATE ON public.ages_contrato_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

DROP TRIGGER IF EXISTS "update_ages_contrato_renovacoes_updated_at" ON public.ages_contrato_renovacoes;
CREATE TRIGGER update_ages_contrato_renovacoes_updated_at
BEFORE UPDATE ON public.ages_contrato_renovacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

DROP TRIGGER IF EXISTS "update_ages_contrato_aditivos_updated_at" ON public.ages_contrato_aditivos;
CREATE TRIGGER update_ages_contrato_aditivos_updated_at
BEFORE UPDATE ON public.ages_contrato_aditivos
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();


-- === 20260105115408_0cfaa47a-0dd9-4809-aff1-f009fbb87b9d.sql ===
-- Adicionar campos faltantes na tabela ages_contratos
DO $$ BEGIN ALTER TABLE public.ages_contratos
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS valor_estimado TEXT,
ADD COLUMN IF NOT EXISTS dias_antecedencia_aviso INTEGER DEFAULT 60; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- === 20260105144855_cd5b1afe-8b7e-4f0b-afa2-9e862d77182f.sql ===
-- Drop existing restrictive SELECT policies and recreate with diretoria access

-- 1. contratos-documentos - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
CREATE POLICY "Authorized users can view contract documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'contratos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 2. medicos-documentos - Create SELECT policy with diretoria
DROP POLICY IF EXISTS "Authorized users can view medicos documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view medicos documents" ON storage.objects;
CREATE POLICY "Authorized users can view medicos documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'medicos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 3. editais-pdfs - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can view editais PDFs" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'editais-pdfs' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 4. suporte-anexos - Create SELECT policy with diretoria and support roles
DROP POLICY IF EXISTS "Users can view support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view support attachments" ON storage.objects;
CREATE POLICY "Users can view support attachments" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'suporte-anexos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    auth.uid() IS NOT NULL
  )
);

-- 5. campanhas-pecas - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view campanhas pecas" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view campanhas pecas" ON storage.objects;
CREATE POLICY "Authorized users can view campanhas pecas" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'campanhas-pecas' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 6. eventos-materiais - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view eventos materiais" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view eventos materiais" ON storage.objects;
CREATE POLICY "Authorized users can view eventos materiais" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'eventos-materiais' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 7. materiais-biblioteca - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view materiais biblioteca" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view materiais biblioteca" ON storage.objects;
CREATE POLICY "Authorized users can view materiais biblioteca" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'materiais-biblioteca' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- === 20260105162552_e57088e8-00f2-4fe1-81a1-50e267a57fff.sql ===
-- Atualizar constraint de status_contrato para incluir 'Em Processo de Renovação' que é usado no frontend
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_contrato_check;

DO $$ BEGIN ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_contrato_check 
  CHECK (status_contrato = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ])); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Para ages_contratos - adicionar constraints (campos são TEXT)
ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_status_check;

DO $$ BEGIN ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_status_check 
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ])); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_assinado_check;

DO $$ BEGIN ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_assinado_check 
  CHECK (assinado IS NULL OR assinado = ANY (ARRAY[
    'Sim'::text, 
    'Pendente'::text, 
    'Em Análise'::text, 
    'Aguardando Retorno'::text
  ])); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === 20260105171030_44ed8510-129e-4796-b46e-92516772c20a.sql ===
-- Tabela para anotações do prontuário médico (área de notas rica)
CREATE TABLE IF NOT EXISTS public.lead_anotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nota', -- 'nota', 'desconversao', 'blacklist', 'alerta'
  titulo TEXT,
  conteudo TEXT NOT NULL,
  imagens TEXT[] DEFAULT '{}', -- URLs das imagens
  metadados JSONB DEFAULT '{}', -- dados extras como motivo desconversão, etc
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Foreign key para leads
DO $$ BEGIN ALTER TABLE public.lead_anotacoes 
ADD CONSTRAINT lead_anotacoes_lead_id_fkey 
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_lead_id ON public.lead_anotacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_tipo ON public.lead_anotacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_created_at ON public.lead_anotacoes(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_anotacoes ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Authenticated users can view lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can view lead_anotacoes"
ON public.lead_anotacoes FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can insert lead_anotacoes"
ON public.lead_anotacoes FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can update lead_anotacoes"
ON public.lead_anotacoes FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can delete lead_anotacoes"
ON public.lead_anotacoes FOR DELETE
TO authenticated
USING (true);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_lead_anotacoes_updated_at" ON public.lead_anotacoes;
CREATE TRIGGER update_lead_anotacoes_updated_at
BEFORE UPDATE ON public.lead_anotacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para imagens das anotações
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lead-anotacoes', 'lead-anotacoes', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do storage
DROP POLICY IF EXISTS "Anyone can view lead-anotacoes images" ON storage.objects;
CREATE POLICY "Anyone can view lead-anotacoes images"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-anotacoes');

DROP POLICY IF EXISTS "Authenticated users can upload lead-anotacoes images" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead-anotacoes images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-anotacoes');

DROP POLICY IF EXISTS "Authenticated users can delete lead-anotacoes images" ON storage.objects;
CREATE POLICY "Authenticated users can delete lead-anotacoes images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-anotacoes');

-- === 20260106115208_60a23a9f-3637-48b6-8eee-8b7653672ca4.sql ===
-- Criar tabela de notificações genéricas do sistema
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'kanban_ativo', 'licitacao', 'contrato', etc.
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  link TEXT, -- URL para redirecionar ao clicar
  referencia_id UUID, -- ID do registro relacionado (card, licitação, etc.)
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_system_notifications_user_id ON public.system_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_system_notifications_lida ON public.system_notifications(user_id, lida);
CREATE INDEX IF NOT EXISTS idx_system_notifications_tipo ON public.system_notifications(tipo);

-- Enable RLS
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.system_notifications;
CREATE POLICY "Users can view their own notifications"
ON public.system_notifications
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.system_notifications;
CREATE POLICY "Users can update their own notifications"
ON public.system_notifications
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.system_notifications;
CREATE POLICY "System can insert notifications"
ON public.system_notifications
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.system_notifications;
CREATE POLICY "Users can delete their own notifications"
ON public.system_notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;

-- === 20260106131544_56b8fa3a-9665-4581-81ec-0113e9d83256.sql ===
-- Remover trigger antigo
DROP TRIGGER IF EXISTS set_contrato_codigo_interno ON contratos;

-- Criar nova função que usa MAX+1
CREATE OR REPLACE FUNCTION public.generate_contrato_codigo_interno()
RETURNS TRIGGER AS $$
DECLARE
  next_id INTEGER;
BEGIN
  IF NEW.codigo_interno IS NULL THEN
    SELECT COALESCE(MAX(codigo_interno), 0) + 1 INTO next_id FROM contratos;
    NEW.codigo_interno := next_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Recriar trigger com nova função
DROP TRIGGER IF EXISTS "set_contrato_codigo_interno" ON contratos;
CREATE TRIGGER set_contrato_codigo_interno
  BEFORE INSERT ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_contrato_codigo_interno();

-- === 20260106144028_64ce2e65-4525-433e-9738-f23d8ea486a5.sql ===
-- Remover o DEFAULT da sequência para que o trigger MAX+1 funcione
DO $$ BEGIN ALTER TABLE contratos ALTER COLUMN codigo_interno DROP DEFAULT; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- Resetar a sequência para o valor correto (para backup caso precise no futuro)
SELECT setval('contratos_codigo_interno_seq', (SELECT COALESCE(MAX(codigo_interno), 0) FROM contratos), true);

-- === 20260107115813_0426ef0e-1143-45ff-bd5a-b98a5b06898d.sql ===
-- Add missing contract field used by the UI
DO $$ BEGIN ALTER TABLE public.ages_contratos
ADD COLUMN IF NOT EXISTS tipo_servico TEXT[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- === 20260107121351_c19e825d-08ad-4303-98dc-0ab667311c5c.sql ===
-- CREATE TABLE IF NOT EXISTS for lead etiquetas configuration (similar to licitacoes_etiquetas_config)
CREATE TABLE IF NOT EXISTS public.leads_etiquetas_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  cor_id TEXT NOT NULL DEFAULT 'gray',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads_etiquetas_config ENABLE ROW LEVEL SECURITY;

-- Create policies for leads_etiquetas_config
DROP POLICY IF EXISTS "Authenticated users can view lead etiquetas config" ON public.leads_etiquetas_config;
CREATE POLICY "Authenticated users can view lead etiquetas config"
ON public.leads_etiquetas_config
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lead etiquetas config" ON public.leads_etiquetas_config;
CREATE POLICY "Authenticated users can insert lead etiquetas config"
ON public.leads_etiquetas_config
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update lead etiquetas config" ON public.leads_etiquetas_config;
CREATE POLICY "Authenticated users can update lead etiquetas config"
ON public.leads_etiquetas_config
FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete lead etiquetas config" ON public.leads_etiquetas_config;
CREATE POLICY "Authenticated users can delete lead etiquetas config"
ON public.leads_etiquetas_config
FOR DELETE
TO authenticated
USING (true);

-- Add trigger to update updated_at
CREATE OR REPLACE TRIGGER update_leads_etiquetas_config_updated_at
BEFORE UPDATE ON public.leads_etiquetas_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20260107122554_13ce61a6-a299-421c-923b-8d941edbc033.sql ===
-- Enable realtime for captacao_permissoes_usuario
ALTER TABLE public.captacao_permissoes_usuario REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.captacao_permissoes_usuario;

-- === 20260107134026_34aa1dbf-9351-42da-9275-ed6ea76f76bb.sql ===
-- Enable realtime for chips table
ALTER TABLE public.chips REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chips;

-- === 20260107194153_480bffc6-365b-40ab-bfcd-5714b52457e8.sql ===
-- Tabela principal: Campanhas/Lotes de disparo
CREATE TABLE IF NOT EXISTS public.disparos_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  proposta_id TEXT,
  texto_ia TEXT,
  instancia TEXT,
  chip_id UUID REFERENCES public.chips(id),
  responsavel_id UUID,
  responsavel_nome TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'pausado', 'concluido', 'cancelado')),
  total_contatos INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  nozap INTEGER DEFAULT 0,
  reenviar INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contatos do disparo
CREATE TABLE IF NOT EXISTS public.disparos_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE,
  nome TEXT,
  telefone_original TEXT,
  telefone_e164 TEXT,
  status TEXT DEFAULT '0-PENDENTE' CHECK (status IN ('0-PENDENTE', '1-FILA', '2-REENVIAR', '3-PROCESSANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA', '7-ERRO')),
  data_envio TIMESTAMPTZ,
  tipo_erro TEXT,
  data_reenvio TIMESTAMPTZ,
  mensagem_enviada TEXT,
  tentativas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_status ON public.disparos_campanhas(status);
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_campanha ON public.disparos_contatos(campanha_id);
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_status ON public.disparos_contatos(status);
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_telefone ON public.disparos_contatos(telefone_e164);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_disparos_campanhas_updated_at" ON public.disparos_campanhas;
CREATE TRIGGER update_disparos_campanhas_updated_at
  BEFORE UPDATE ON public.disparos_campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_disparos_contatos_updated_at" ON public.disparos_contatos;
CREATE TRIGGER update_disparos_contatos_updated_at
  BEFORE UPDATE ON public.disparos_contatos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.disparos_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_contatos ENABLE ROW LEVEL SECURITY;

-- Políticas para campanhas
DROP POLICY IF EXISTS "Usuários autenticados podem ver campanhas" ON public.disparos_campanhas;
CREATE POLICY "Usuários autenticados podem ver campanhas"
  ON public.disparos_campanhas FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem criar campanhas" ON public.disparos_campanhas;
CREATE POLICY "Usuários autenticados podem criar campanhas"
  ON public.disparos_campanhas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar campanhas" ON public.disparos_campanhas;
CREATE POLICY "Usuários autenticados podem atualizar campanhas"
  ON public.disparos_campanhas FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar campanhas" ON public.disparos_campanhas;
CREATE POLICY "Usuários autenticados podem deletar campanhas"
  ON public.disparos_campanhas FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Políticas para contatos
DROP POLICY IF EXISTS "Usuários autenticados podem ver contatos" ON public.disparos_contatos;
CREATE POLICY "Usuários autenticados podem ver contatos"
  ON public.disparos_contatos FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem criar contatos" ON public.disparos_contatos;
CREATE POLICY "Usuários autenticados podem criar contatos"
  ON public.disparos_contatos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar contatos" ON public.disparos_contatos;
CREATE POLICY "Usuários autenticados podem atualizar contatos"
  ON public.disparos_contatos FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar contatos" ON public.disparos_contatos;
CREATE POLICY "Usuários autenticados podem deletar contatos"
  ON public.disparos_contatos FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Habilitar realtime para acompanhamento em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_campanhas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_contatos;

-- === 20260107210859_95db3851-2135-458b-96bb-2db8b559c67c.sql ===
-- Permitir licitacao_id nulo para cards criados manualmente
DO $$ BEGIN ALTER TABLE public.contrato_rascunho ALTER COLUMN licitacao_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- === 20260107221256_c3fd05a5-5dea-4255-897e-aaed403ab456.sql ===
-- Adicionar coluna cidade na tabela leads
DO $$ BEGIN ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cidade TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- === 20260107230409_4499d305-22c8-4611-a3fa-fd424da856fc.sql ===
-- Remover o CHECK constraint atual
ALTER TABLE public.disparos_contatos DROP CONSTRAINT IF EXISTS disparos_contatos_status_check;

-- Atualizar os registros existentes para os novos status
UPDATE public.disparos_contatos SET status = '1-ENVIAR' WHERE status NOT IN ('1-ENVIAR', '2-REENVIAR', '3-TRATANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA');

-- Adicionar novo CHECK constraint com os status corretos
DO $$ BEGIN ALTER TABLE public.disparos_contatos 
ADD CONSTRAINT disparos_contatos_status_check 
CHECK (status IN ('1-ENVIAR', '2-REENVIAR', '3-TRATANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atualizar o default para 1-ENVIAR
DO $$ BEGIN ALTER TABLE public.disparos_contatos ALTER COLUMN status SET DEFAULT '1-ENVIAR'; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- === 20260107234929_1dfaa482-d86b-42c9-913f-460b75fba148.sql ===
-- Adicionar coluna proximo_envio para agendamento de lotes
DO $$ BEGIN ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS proximo_envio TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- === 20260108114129_efe68c38-0eca-49ff-9b2e-e88e1814da79.sql ===
-- Adicionar campo ativo na tabela disparos_campanhas
DO $$ BEGIN ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índice para filtro de ativos
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_ativo ON public.disparos_campanhas(ativo);

-- === 20260108122235_5ac21cd0-4bf2-4050-9d66-9d10b1fed111.sql ===
-- Adicionar campo lead_id na tabela disparos_contatos para rastreabilidade
DO $$ BEGIN ALTER TABLE public.disparos_contatos 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índice para buscas por lead
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_lead_id ON public.disparos_contatos(lead_id);

-- Comentário explicativo
COMMENT ON COLUMN public.disparos_contatos.lead_id IS 'Referência ao lead original para rastreabilidade no histórico do prontuário';

-- === 20260109170426_687df272-b5ac-46e9-b0fd-5966d4451cad.sql ===
-- Adicionar política para permitir que usuários com permissão de captação gerenciem chips
DROP POLICY IF EXISTS "Captacao users can manage chips" ON public.chips;
CREATE POLICY "Captacao users can manage chips"
ON public.chips
FOR ALL
USING (
  has_captacao_permission(auth.uid(), 'seigzaps_config')
)
WITH CHECK (
  has_captacao_permission(auth.uid(), 'seigzaps_config')
);

-- Também permitir líderes gerenciarem chips
DROP POLICY IF EXISTS "Leaders can manage chips" ON public.chips;
CREATE POLICY "Leaders can manage chips"
ON public.chips
FOR ALL
USING (
  is_leader(auth.uid())
)
WITH CHECK (
  is_leader(auth.uid())
);

-- === 20260112123756_167dad94-53b7-4f37-bae0-5e2025e7696c.sql ===
-- Tabela para histórico de importações de leads
CREATE TABLE IF NOT EXISTS public.lead_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, processando, concluido, erro
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT,
  total_linhas INTEGER DEFAULT 0,
  inseridos INTEGER DEFAULT 0,
  atualizados INTEGER DEFAULT 0,
  ignorados INTEGER DEFAULT 0,
  erros JSONB DEFAULT '[]'::jsonb,
  mapeamento_colunas JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_by_nome TEXT
);

-- Habilitar RLS
ALTER TABLE public.lead_import_jobs ENABLE ROW LEVEL SECURITY;

-- Política para visualização - usuários autenticados podem ver todos os imports
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar imports" ON public.lead_import_jobs;
CREATE POLICY "Usuários autenticados podem visualizar imports" 
ON public.lead_import_jobs 
FOR SELECT 
TO authenticated
USING (true);

-- Política para inserção - usuários autenticados podem criar imports
DROP POLICY IF EXISTS "Usuários autenticados podem criar imports" ON public.lead_import_jobs;
CREATE POLICY "Usuários autenticados podem criar imports" 
ON public.lead_import_jobs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Política para atualização - apenas o sistema (service role) pode atualizar
DROP POLICY IF EXISTS "Service role pode atualizar imports" ON public.lead_import_jobs;
CREATE POLICY "Service role pode atualizar imports" 
ON public.lead_import_jobs 
FOR UPDATE 
USING (true);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_lead_import_jobs_updated_at" ON public.lead_import_jobs;
CREATE TRIGGER update_lead_import_jobs_updated_at
BEFORE UPDATE ON public.lead_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_import_jobs;

-- === 20260112130559_2255a8a3-68ce-4447-a582-b33a1359da3c.sql ===
-- Add columns for chunk-based processing
DO $$ BEGIN ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS arquivo_storage_path TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS chunk_atual INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 1; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS linhas_processadas INTEGER DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add unique constraint on leads.phone_e164 for efficient upsert
DO $$ BEGIN ALTER TABLE leads ADD CONSTRAINT leads_phone_e164_unique UNIQUE (phone_e164); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === 20260112144134_05e1b5ad-1e36-40f7-a70d-116139263d7e.sql ===
-- Adicionar políticas de INSERT para sigzap_contacts baseado em permissão de captação
DROP POLICY IF EXISTS "Captadores com permissao zap podem inserir contatos" ON public.sigzap_contacts;
CREATE POLICY "Captadores com permissao zap podem inserir contatos"
  ON public.sigzap_contacts FOR INSERT
  WITH CHECK (public.has_captacao_permission(auth.uid(), 'disparos_zap'));

-- Adicionar políticas de INSERT para sigzap_conversations baseado em permissão de captação
DROP POLICY IF EXISTS "Captadores com permissao zap podem inserir conversas" ON public.sigzap_conversations;
CREATE POLICY "Captadores com permissao zap podem inserir conversas"
  ON public.sigzap_conversations FOR INSERT
  WITH CHECK (public.has_captacao_permission(auth.uid(), 'disparos_zap'));

-- Adicionar política de UPDATE para sigzap_contacts (para atualizar dados do contato)
DROP POLICY IF EXISTS "Captadores com permissao zap podem atualizar contatos" ON public.sigzap_contacts;
CREATE POLICY "Captadores com permissao zap podem atualizar contatos"
  ON public.sigzap_contacts FOR UPDATE
  USING (public.has_captacao_permission(auth.uid(), 'disparos_zap'));

-- === 20260113161600_6f65fda1-3f96-4ef8-b609-3fee0f4bccd9.sql ===
-- Adicionar novo tipo de evento para reprocessamento de médico no Kanban
DO $$ BEGIN ALTER TYPE public.tipo_evento_lead ADD VALUE IF NOT EXISTS 'reprocessado_kanban'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === 20260113162126_194501a7-56bf-4077-9caa-1460842f19a6.sql ===
-- Atualizar política de visualização de médicos para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar medicos" ON public.medicos;

DROP POLICY IF EXISTS "Gestores podem visualizar medicos" ON public.medicos;
CREATE POLICY "Gestores podem visualizar medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role) 
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- === 20260113163057_82fc60c2-6dda-4c12-a23a-820bb4584dbf.sql ===
-- Adicionar campo etiquetas na tabela medico_kanban_cards
DO $$ BEGIN ALTER TABLE public.medico_kanban_cards
ADD COLUMN etiquetas text[] DEFAULT '{}'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índice para busca por etiquetas
CREATE INDEX IF NOT EXISTS idx_medico_kanban_cards_etiquetas ON public.medico_kanban_cards USING GIN(etiquetas);

-- === 20260115145801_9f81baeb-2c88-4d14-a0a5-9c0644eaf027.sql ===
-- Adicionar nova coluna para ages_clientes
DO $$ BEGIN ALTER TABLE public.ages_producao 
ADD COLUMN ages_cliente_id UUID REFERENCES public.ages_clientes(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adicionar nova coluna para ages_unidades (opcional)
DO $$ BEGIN ALTER TABLE public.ages_producao 
ADD COLUMN ages_unidade_id UUID REFERENCES public.ages_unidades(id); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_ages_producao_ages_cliente ON public.ages_producao(ages_cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_producao_ages_unidade ON public.ages_producao(ages_unidade_id);

-- === 20260115183459_a76151f6-62b5-4d75-ac84-412d1960d051.sql ===
-- Permitir que cliente_id seja NULL já que agora usamos ages_cliente_id
DO $$ BEGIN ALTER TABLE public.ages_producao ALTER COLUMN cliente_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- === 20260116115825_47058580-d88a-44d4-9021-287aa9ec1311.sql ===
-- Criar enum para níveis de urgência
DO $$ BEGIN CREATE TYPE public.nivel_urgencia_suporte AS ENUM (
  'critica',
  'alta',
  'media',
  'baixa'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Criar enum para tipos de impacto
DO $$ BEGIN CREATE TYPE public.tipo_impacto_suporte AS ENUM (
  'sistema',
  'infraestrutura',
  'acesso_permissao',
  'integracao',
  'duvida_operacional',
  'melhoria'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Adicionar novos campos na tabela suporte_tickets
DO $$ BEGIN ALTER TABLE public.suporte_tickets
ADD COLUMN nivel_urgencia public.nivel_urgencia_suporte DEFAULT NULL,
ADD COLUMN tipo_impacto public.tipo_impacto_suporte DEFAULT NULL,
ADD COLUMN responsavel_ti_id uuid DEFAULT NULL,
ADD COLUMN responsavel_ti_nome text DEFAULT NULL,
ADD COLUMN sla_resposta_minutos integer DEFAULT NULL,
ADD COLUMN sla_resolucao_minutos integer DEFAULT NULL,
ADD COLUMN data_primeira_resposta timestamp with time zone DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar tabela de configuração de SLA por urgência
CREATE TABLE IF NOT EXISTS public.suporte_sla_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nivel_urgencia public.nivel_urgencia_suporte NOT NULL UNIQUE,
  sla_resposta_minutos integer NOT NULL,
  sla_resolucao_minutos integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Inserir configuração padrão de SLA (em minutos)
INSERT INTO public.suporte_sla_config (nivel_urgencia, sla_resposta_minutos, sla_resolucao_minutos) VALUES
  ('critica', 30, 240),      -- 30 min resposta, 4h resolução
  ('alta', 60, 480),         -- 1h resposta, 8h resolução
  ('media', 240, 1440),      -- 4h resposta, 24h resolução
  ('baixa', 480, 2880);      -- 8h resposta, 48h resolução

-- Habilitar RLS
ALTER TABLE public.suporte_sla_config ENABLE ROW LEVEL SECURITY;

-- Políticas para suporte_sla_config (leitura para todos autenticados)
DROP POLICY IF EXISTS "Todos podem visualizar configuração de SLA" ON public.suporte_sla_config;
CREATE POLICY "Todos podem visualizar configuração de SLA"
ON public.suporte_sla_config
FOR SELECT
TO authenticated
USING (true);

-- Criar função para definir SLA automaticamente baseado na urgência
CREATE OR REPLACE FUNCTION public.set_ticket_sla()
RETURNS TRIGGER AS $$
BEGIN
  -- Se o nível de urgência foi definido ou alterado
  IF NEW.nivel_urgencia IS NOT NULL AND (OLD IS NULL OR OLD.nivel_urgencia IS DISTINCT FROM NEW.nivel_urgencia) THEN
    SELECT sla_resposta_minutos, sla_resolucao_minutos
    INTO NEW.sla_resposta_minutos, NEW.sla_resolucao_minutos
    FROM public.suporte_sla_config
    WHERE nivel_urgencia = NEW.nivel_urgencia;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para aplicar SLA automaticamente
DROP TRIGGER IF EXISTS "trigger_set_ticket_sla" ON public.suporte_tickets;
CREATE TRIGGER trigger_set_ticket_sla
BEFORE INSERT OR UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_sla();

-- === 20260116123425_ec38c08c-3d56-41f8-a304-2a3c3597c491.sql ===
-- 1. Criar enums para classificação e motivo de perda
DO $$ BEGIN CREATE TYPE classificacao_gss_licitacao AS ENUM (
  'primeiro_lugar',
  'segundo_lugar',
  'desclassificada',
  'nao_habilitada'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE motivo_perda_licitacao AS ENUM (
  'preco',
  'documentacao',
  'prazo',
  'habilitacao_tecnica',
  'estrategia',
  'outros'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Criar tabela de empresas concorrentes
CREATE TABLE IF NOT EXISTS public.empresas_concorrentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  regiao_atuacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índice único no nome (case insensitive) para evitar duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS empresas_concorrentes_nome_unique ON public.empresas_concorrentes (LOWER(TRIM(nome)));

-- Enable RLS
ALTER TABLE public.empresas_concorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas para empresas_concorrentes
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar empresas concorrentes" ON public.empresas_concorrentes;
CREATE POLICY "Usuários autenticados podem visualizar empresas concorrentes"
ON public.empresas_concorrentes FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar empresas concorrentes" ON public.empresas_concorrentes;
CREATE POLICY "Usuários autenticados podem criar empresas concorrentes"
ON public.empresas_concorrentes FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar empresas concorrentes" ON public.empresas_concorrentes;
CREATE POLICY "Usuários autenticados podem atualizar empresas concorrentes"
ON public.empresas_concorrentes FOR UPDATE
TO authenticated
USING (true);

-- 3. Criar tabela de resultados de licitação
CREATE TABLE IF NOT EXISTS public.licitacao_resultados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  empresa_vencedora_id UUID REFERENCES public.empresas_concorrentes(id),
  empresa_vencedora_nome TEXT NOT NULL,
  valor_homologado NUMERIC(15,2) NOT NULL,
  classificacao_gss classificacao_gss_licitacao NOT NULL,
  motivo_perda motivo_perda_licitacao,
  observacoes_estrategicas TEXT,
  registrado_por UUID,
  registrado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT licitacao_resultados_unique UNIQUE (licitacao_id)
);

-- Índices para performance em BI
CREATE INDEX IF NOT EXISTS licitacao_resultados_empresa_idx ON public.licitacao_resultados(empresa_vencedora_id);
CREATE INDEX IF NOT EXISTS licitacao_resultados_classificacao_idx ON public.licitacao_resultados(classificacao_gss);
CREATE INDEX IF NOT EXISTS licitacao_resultados_motivo_idx ON public.licitacao_resultados(motivo_perda);
CREATE INDEX IF NOT EXISTS licitacao_resultados_created_idx ON public.licitacao_resultados(created_at);

-- Enable RLS
ALTER TABLE public.licitacao_resultados ENABLE ROW LEVEL SECURITY;

-- Políticas para licitacao_resultados
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar resultados" ON public.licitacao_resultados;
CREATE POLICY "Usuários autenticados podem visualizar resultados"
ON public.licitacao_resultados FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar resultados" ON public.licitacao_resultados;
CREATE POLICY "Usuários autenticados podem criar resultados"
ON public.licitacao_resultados FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar resultados" ON public.licitacao_resultados;
CREATE POLICY "Usuários autenticados podem atualizar resultados"
ON public.licitacao_resultados FOR UPDATE
TO authenticated
USING (true);

-- 4. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_empresas_concorrentes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS "tr_empresas_concorrentes_updated_at" ON public.empresas_concorrentes;
CREATE TRIGGER tr_empresas_concorrentes_updated_at
BEFORE UPDATE ON public.empresas_concorrentes
FOR EACH ROW
EXECUTE FUNCTION update_empresas_concorrentes_updated_at();

CREATE OR REPLACE FUNCTION update_licitacao_resultados_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS "tr_licitacao_resultados_updated_at" ON public.licitacao_resultados;
CREATE TRIGGER tr_licitacao_resultados_updated_at
BEFORE UPDATE ON public.licitacao_resultados
FOR EACH ROW
EXECUTE FUNCTION update_licitacao_resultados_updated_at();

-- 5. Função helper para criar ou buscar empresa concorrente (evitar duplicatas)
CREATE OR REPLACE FUNCTION get_or_create_empresa_concorrente(p_nome TEXT)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_nome_normalizado TEXT;
BEGIN
  v_nome_normalizado := TRIM(p_nome);
  
  -- Tentar encontrar existente
  SELECT id INTO v_id
  FROM public.empresas_concorrentes
  WHERE LOWER(TRIM(nome)) = LOWER(v_nome_normalizado);
  
  -- Se não existe, criar
  IF v_id IS NULL THEN
    INSERT INTO public.empresas_concorrentes (nome)
    VALUES (v_nome_normalizado)
    RETURNING id INTO v_id;
  END IF;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- === 20260116170424_5a492dae-3060-4fbe-bcfb-99afefa40d25.sql ===
-- Tabela de pastas/temas do usuário
CREATE TABLE IF NOT EXISTS public.user_pastas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT DEFAULT '#6366f1',
  icone TEXT DEFAULT 'folder',
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de notas/cards
CREATE TABLE IF NOT EXISTS public.user_notas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pasta_id UUID REFERENCES public.user_pastas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT,
  tags TEXT[] DEFAULT '{}',
  fixada BOOLEAN DEFAULT false,
  arquivada BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de checklist items
CREATE TABLE IF NOT EXISTS public.user_notas_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_id UUID NOT NULL REFERENCES public.user_notas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de anexos/links
CREATE TABLE IF NOT EXISTS public.user_notas_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_id UUID NOT NULL REFERENCES public.user_notas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'link', -- 'link' ou 'arquivo'
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.user_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas_anexos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_pastas (privado por usuário)
DROP POLICY IF EXISTS "Usuários podem ver suas próprias pastas" ON public.user_pastas;
CREATE POLICY "Usuários podem ver suas próprias pastas"
  ON public.user_pastas FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas próprias pastas" ON public.user_pastas;
CREATE POLICY "Usuários podem criar suas próprias pastas"
  ON public.user_pastas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias pastas" ON public.user_pastas;
CREATE POLICY "Usuários podem atualizar suas próprias pastas"
  ON public.user_pastas FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias pastas" ON public.user_pastas;