
-- Tabela: radiologia_ecg
CREATE TABLE IF NOT EXISTS public.radiologia_ecg (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  paciente TEXT NOT NULL,
  data_hora_liberacao TIMESTAMP WITH TIME ZONE NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: medico_indisponibilidades
CREATE TABLE IF NOT EXISTS public.medico_indisponibilidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo motivo_indisponibilidade NOT NULL,
  inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  fim TIMESTAMP WITH TIME ZONE NOT NULL,
  detalhes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (fim >= inicio)
);

-- Enable RLS
ALTER TABLE public.radiologia_agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_producao_exames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_ajuste_laudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_exames_atraso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_ecg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medico_indisponibilidades ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin e gestor_contratos podem gerenciar, outros apenas leitura)
DROP POLICY IF EXISTS "Authorized users can manage radiologia_agendas" ON public.radiologia_agendas;
CREATE POLICY "Authorized users can manage radiologia_agendas" ON public.radiologia_agendas
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage radiologia_producao_exames" ON public.radiologia_producao_exames;
CREATE POLICY "Authorized users can manage radiologia_producao_exames" ON public.radiologia_producao_exames
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage radiologia_pendencias" ON public.radiologia_pendencias;
CREATE POLICY "Authorized users can manage radiologia_pendencias" ON public.radiologia_pendencias
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage radiologia_ajuste_laudos" ON public.radiologia_ajuste_laudos;
CREATE POLICY "Authorized users can manage radiologia_ajuste_laudos" ON public.radiologia_ajuste_laudos
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage radiologia_exames_atraso" ON public.radiologia_exames_atraso;
CREATE POLICY "Authorized users can manage radiologia_exames_atraso" ON public.radiologia_exames_atraso
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage radiologia_ecg" ON public.radiologia_ecg;
CREATE POLICY "Authorized users can manage radiologia_ecg" ON public.radiologia_ecg
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authorized users can manage medico_indisponibilidades" ON public.medico_indisponibilidades;
CREATE POLICY "Authorized users can manage medico_indisponibilidades" ON public.medico_indisponibilidades
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role));

-- Triggers para updated_at
DROP TRIGGER IF EXISTS "update_radiologia_agendas_updated_at" ON public.radiologia_agendas;
CREATE TRIGGER update_radiologia_agendas_updated_at
  BEFORE UPDATE ON public.radiologia_agendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_producao_exames_updated_at" ON public.radiologia_producao_exames;
CREATE TRIGGER update_radiologia_producao_exames_updated_at
  BEFORE UPDATE ON public.radiologia_producao_exames
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_pendencias_updated_at" ON public.radiologia_pendencias;
CREATE TRIGGER update_radiologia_pendencias_updated_at
  BEFORE UPDATE ON public.radiologia_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_ajuste_laudos_updated_at" ON public.radiologia_ajuste_laudos;
CREATE TRIGGER update_radiologia_ajuste_laudos_updated_at
  BEFORE UPDATE ON public.radiologia_ajuste_laudos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_exames_atraso_updated_at" ON public.radiologia_exames_atraso;
CREATE TRIGGER update_radiologia_exames_atraso_updated_at
  BEFORE UPDATE ON public.radiologia_exames_atraso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_ecg_updated_at" ON public.radiologia_ecg;
CREATE TRIGGER update_radiologia_ecg_updated_at
  BEFORE UPDATE ON public.radiologia_ecg
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_medico_indisponibilidades_updated_at" ON public.medico_indisponibilidades;
CREATE TRIGGER update_medico_indisponibilidades_updated_at
  BEFORE UPDATE ON public.medico_indisponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251024131724_c0e06b4b-398d-4320-a18f-e915e2e4ead2.sql ===
-- Create storage bucket for radiologia attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('radiologia-anexos', 'radiologia-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for viewing attachments
DROP POLICY IF EXISTS "Authenticated users can view radiologia attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view radiologia attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'radiologia-anexos' AND auth.role() = 'authenticated');

-- Create storage policy for uploading attachments
DROP POLICY IF EXISTS "Authenticated users can upload radiologia attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload radiologia attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'radiologia-anexos' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create storage policy for deleting own attachments
DROP POLICY IF EXISTS "Users can delete their own radiologia attachments" ON storage.objects;
CREATE POLICY "Users can delete their own radiologia attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'radiologia-anexos' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- === 20251024135139_a24af66c-e9bc-4224-a590-50c617d752b2.sql ===
-- Adicionar novo role para radiologia (será usado em migration posterior)
DO $atvblk$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_radiologia'; EXCEPTION WHEN duplicate_object THEN NULL; END $atvblk$;

-- === 20251024135829_f1f33f5a-45f7-456f-b215-e477fe7e5fad.sql ===
-- Atualizar RLS policies das tabelas de radiologia para incluir gestor_radiologia

-- radiologia_agendas
DROP POLICY IF EXISTS "Authorized users can manage radiologia_agendas" ON radiologia_agendas;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_agendas" ON radiologia_agendas;
CREATE POLICY "Authorized users can manage radiologia_agendas"
ON radiologia_agendas
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_producao_exames
DROP POLICY IF EXISTS "Authorized users can manage radiologia_producao_exames" ON radiologia_producao_exames;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_producao_exames" ON radiologia_producao_exames;
CREATE POLICY "Authorized users can manage radiologia_producao_exames"
ON radiologia_producao_exames
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias
DROP POLICY IF EXISTS "Authorized users can manage radiologia_pendencias" ON radiologia_pendencias;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_pendencias" ON radiologia_pendencias;
CREATE POLICY "Authorized users can manage radiologia_pendencias"
ON radiologia_pendencias
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_ajuste_laudos
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ajuste_laudos" ON radiologia_ajuste_laudos;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ajuste_laudos" ON radiologia_ajuste_laudos;
CREATE POLICY "Authorized users can manage radiologia_ajuste_laudos"
ON radiologia_ajuste_laudos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_exames_atraso
DROP POLICY IF EXISTS "Authorized users can manage radiologia_exames_atraso" ON radiologia_exames_atraso;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_exames_atraso" ON radiologia_exames_atraso;
CREATE POLICY "Authorized users can manage radiologia_exames_atraso"
ON radiologia_exames_atraso
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_ecg
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ecg" ON radiologia_ecg;
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ecg" ON radiologia_ecg;
CREATE POLICY "Authorized users can manage radiologia_ecg"
ON radiologia_ecg
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- === 20251024140731_c1c06c6e-c06f-481e-b595-9690f5fcd9d7.sql ===
-- Update RLS to allow admins to update any profile and users to update their own
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users or admins can update profiles" ON public.profiles;
CREATE POLICY "Users or admins can update profiles"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id OR is_admin(auth.uid()))
WITH CHECK (auth.uid() = id OR is_admin(auth.uid()));

-- Ensure foreign key from profiles.setor_id -> setores.id for nested select and data integrity
-- NESTED_REMOVED: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'profiles_setor_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_setor_id_fkey
    FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- === 20251024141638_53ca7608-fd13-4089-ae67-9f6ef1c22521.sql ===
-- Add RLS policy to allow gestor_contratos to manage medicos
DROP POLICY IF EXISTS "Gestores de contratos can manage medicos" ON public.medicos;
CREATE POLICY "Gestores de contratos can manage medicos"
ON public.medicos
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;

-- === 20251024145636_84e12f95-1588-4121-b4d8-09e61cb97683.sql ===
-- Criar enums para suporte
    CREATE TYPE public.destino_suporte AS ENUM ('interno', 'externo');
    CREATE TYPE public.tipo_suporte AS ENUM ('software', 'hardware');
    CREATE TYPE public.status_ticket AS ENUM ('pendente', 'em_analise', 'concluido');
    CREATE TYPE public.fornecedor_externo AS ENUM ('dr_escala', 'infra_ti');

-- Criar tabela de tickets de suporte
CREATE TABLE IF NOT EXISTS public.suporte_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  solicitante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  solicitante_nome TEXT NOT NULL,
  setor_id UUID REFERENCES public.setores(id),
  setor_nome TEXT,
  data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  destino public.destino_suporte NOT NULL,
  tipo public.tipo_suporte NOT NULL,
  fornecedor_externo public.fornecedor_externo,
  descricao TEXT NOT NULL CHECK (LENGTH(descricao) >= 10),
  status public.status_ticket NOT NULL DEFAULT 'pendente',
  anexos TEXT[],
  historico JSONB DEFAULT '[]'::jsonb,
  data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Criar tabela de comentários
CREATE TABLE IF NOT EXISTS public.suporte_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.suporte_tickets(id) ON DELETE CASCADE NOT NULL,
  autor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  autor_nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar função para gerar número do ticket
CREATE OR REPLACE FUNCTION public.generate_ticket_numero()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM 'SUP-\d{4}-(\d{6})') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.suporte_tickets
  WHERE numero LIKE 'SUP-' || year_str || '-%';
  
  RETURN 'SUP-' || year_str || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$;

-- Criar trigger para gerar número do ticket automaticamente
CREATE OR REPLACE FUNCTION public.set_ticket_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.generate_ticket_numero();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trigger_set_ticket_numero" ON public.suporte_tickets;
CREATE TRIGGER trigger_set_ticket_numero
BEFORE INSERT ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_numero();

-- Criar trigger para atualizar data_ultima_atualizacao
DROP TRIGGER IF EXISTS "update_suporte_tickets_updated_at" ON public.suporte_tickets;
CREATE TRIGGER update_suporte_tickets_updated_at
BEFORE UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_suporte_comentarios_updated_at" ON public.suporte_comentarios;
CREATE TRIGGER update_suporte_comentarios_updated_at
BEFORE UPDATE ON public.suporte_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.suporte_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_comentarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies para suporte_tickets
-- Usuários podem ver seus próprios tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON public.suporte_tickets;
CREATE POLICY "Users can view own tickets"
ON public.suporte_tickets
FOR SELECT
USING (
  auth.uid() = solicitante_id 
  OR is_admin(auth.uid())
);

-- Usuários podem criar tickets
DROP POLICY IF EXISTS "Users can create tickets" ON public.suporte_tickets;
CREATE POLICY "Users can create tickets"
ON public.suporte_tickets
FOR INSERT
WITH CHECK (auth.uid() = solicitante_id);

-- Usuários podem editar seus tickets (quando não concluídos)
DROP POLICY IF EXISTS "Users can update own tickets" ON public.suporte_tickets;
CREATE POLICY "Users can update own tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  (auth.uid() = solicitante_id AND status != 'concluido')
  OR is_admin(auth.uid())
);

-- Admins podem deletar tickets
DROP POLICY IF EXISTS "Admins can delete tickets" ON public.suporte_tickets;
CREATE POLICY "Admins can delete tickets"
ON public.suporte_tickets
FOR DELETE
USING (is_admin(auth.uid()));

-- RLS Policies para suporte_comentarios
-- Usuários podem ver comentários de seus tickets
DROP POLICY IF EXISTS "Users can view comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can view comments on their tickets"
ON public.suporte_comentarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.suporte_tickets
    WHERE id = ticket_id
    AND (solicitante_id = auth.uid() OR is_admin(auth.uid()))
  )
);

-- Usuários podem criar comentários em seus tickets
DROP POLICY IF EXISTS "Users can create comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
WITH CHECK (
  auth.uid() = autor_id
  AND EXISTS (
    SELECT 1 FROM public.suporte_tickets
    WHERE id = ticket_id
    AND (solicitante_id = auth.uid() OR is_admin(auth.uid()))
  )
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_numero ON public.suporte_tickets(numero);
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_status ON public.suporte_tickets(status);
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_solicitante ON public.suporte_tickets(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_data_abertura ON public.suporte_tickets(data_abertura);
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_data_atualizacao ON public.suporte_tickets(data_ultima_atualizacao);
CREATE INDEX IF NOT EXISTS idx_suporte_comentarios_ticket ON public.suporte_comentarios(ticket_id);

-- === 20251024145935_8e00069a-14a2-4866-9db8-d652a996f2ba.sql ===
-- Criar bucket para anexos de suporte
INSERT INTO storage.buckets (id, name, public) 
VALUES ('suporte-anexos', 'suporte-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para suporte-anexos
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
CREATE POLICY "Users can upload their own files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'suporte-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can view files from their tickets" ON storage.objects;
CREATE POLICY "Users can view files from their tickets"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'suporte-anexos'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR is_admin(auth.uid())
  )
);

-- === 20251024165355_f738ab87-fd6f-469d-8429-d166e1609444.sql ===
-- Adicionar novos campos à tabela radiologia_pendencias
ALTER TABLE radiologia_pendencias 
  ADD COLUMN IF NOT EXISTS data_deteccao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS quantidade_pendente INTEGER DEFAULT 1 CHECK (quantidade_pendente >= 1),
  ADD COLUMN IF NOT EXISTS descricao_inicial TEXT,
  ADD COLUMN IF NOT EXISTS status_pendencia TEXT DEFAULT 'aberta' CHECK (status_pendencia IN ('aberta', 'em_analise', 'encaminhada_medico', 'aguardando_laudo', 'resolvida')),
  ADD COLUMN IF NOT EXISTS responsavel_atual_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS prazo_limite_sla TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '48 hours'),
  ADD COLUMN IF NOT EXISTS data_resolucao TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS descricao_resolucao TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_internas TEXT,
  ADD COLUMN IF NOT EXISTS id_exame_externo TEXT;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_status ON radiologia_pendencias(status_pendencia);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_cliente ON radiologia_pendencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_medico ON radiologia_pendencias(medico_id);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_data_deteccao ON radiologia_pendencias(data_deteccao);

-- Criar tabela de histórico de pendências
CREATE TABLE IF NOT EXISTS radiologia_pendencias_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id UUID NOT NULL REFERENCES radiologia_pendencias(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acao TEXT NOT NULL,
  detalhes TEXT,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_historico_pendencia ON radiologia_pendencias_historico(pendencia_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_historico_data ON radiologia_pendencias_historico(data_hora);

-- Criar tabela de comentários de pendências
CREATE TABLE IF NOT EXISTS radiologia_pendencias_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id UUID NOT NULL REFERENCES radiologia_pendencias(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  comentario TEXT NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_comentarios_pendencia ON radiologia_pendencias_comentarios(pendencia_id);

-- Criar tabela de configuração de SLA por cliente (opcional)
CREATE TABLE IF NOT EXISTS radiologia_config_sla_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  sla_horas INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(cliente_id, segmento)
);

-- RLS Policies para radiologia_pendencias_historico
ALTER TABLE radiologia_pendencias_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view historico" ON radiologia_pendencias_historico;
CREATE POLICY "Authorized users can view historico"
ON radiologia_pendencias_historico FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

DROP POLICY IF EXISTS "Authorized users can insert historico" ON radiologia_pendencias_historico;
CREATE POLICY "Authorized users can insert historico"
ON radiologia_pendencias_historico FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- RLS Policies para radiologia_pendencias_comentarios
ALTER TABLE radiologia_pendencias_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can view comentarios" ON radiologia_pendencias_comentarios;
CREATE POLICY "Authorized users can view comentarios"
ON radiologia_pendencias_comentarios FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

DROP POLICY IF EXISTS "Authorized users can insert comentarios" ON radiologia_pendencias_comentarios;
CREATE POLICY "Authorized users can insert comentarios"
ON radiologia_pendencias_comentarios FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

DROP POLICY IF EXISTS "Users can update own comentarios" ON radiologia_pendencias_comentarios;
CREATE POLICY "Users can update own comentarios"
ON radiologia_pendencias_comentarios FOR UPDATE
USING (auth.uid() = usuario_id);

-- RLS Policies para radiologia_config_sla_cliente
ALTER TABLE radiologia_config_sla_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can manage config_sla" ON radiologia_config_sla_cliente;
CREATE POLICY "Authorized users can manage config_sla"
ON radiologia_config_sla_cliente FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- Trigger para atualizar updated_at em comentários
CREATE OR REPLACE FUNCTION update_radiologia_pendencias_comentarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "update_pendencias_comentarios_updated_at" ON radiologia_pendencias_comentarios;
CREATE TRIGGER update_pendencias_comentarios_updated_at
BEFORE UPDATE ON radiologia_pendencias_comentarios
FOR EACH ROW
EXECUTE FUNCTION update_radiologia_pendencias_comentarios_updated_at();

-- Trigger para atualizar updated_at em config_sla
DROP TRIGGER IF EXISTS "update_config_sla_updated_at" ON radiologia_config_sla_cliente;
CREATE TRIGGER update_config_sla_updated_at
BEFORE UPDATE ON radiologia_config_sla_cliente
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251024170631_c5e22112-2d8c-4d5b-8c5b-92ffe0d640f3.sql ===
-- Corrigir search_path da função criada na migration anterior
DROP FUNCTION IF EXISTS update_radiologia_pendencias_comentarios_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_radiologia_pendencias_comentarios_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recriar o trigger
DROP TRIGGER IF EXISTS "update_pendencias_comentarios_updated_at" ON radiologia_pendencias_comentarios;
CREATE TRIGGER update_pendencias_comentarios_updated_at
BEFORE UPDATE ON radiologia_pendencias_comentarios
FOR EACH ROW
EXECUTE FUNCTION update_radiologia_pendencias_comentarios_updated_at();

-- === 20251024172505_9438fe21-7ec5-4a7d-a8f3-f215586a85e0.sql ===
-- Atualizar enum de status_ticket para incluir novos status
    ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aberto';
    ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_usuario';
    ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'em_validacao';

-- Adicionar campo setor_responsavel à tabela suporte_tickets
ALTER TABLE public.suporte_tickets
ADD COLUMN IF NOT EXISTS setor_responsavel text DEFAULT 'TI';

-- Criar índice para melhor performance nas consultas por setor
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_setor_responsavel 
ON public.suporte_tickets(setor_responsavel);

-- Criar índice para melhor performance nas consultas por status
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_status 
ON public.suporte_tickets(status);

COMMENT ON COLUMN public.suporte_tickets.setor_responsavel IS 'Setor responsável pela análise e resolução do ticket. Default: TI para triagem inicial';

-- === 20251024175117_be6840b8-f9db-45c7-9e9d-1b998bf98ea8.sql ===
-- Adicionar política para gestores de radiologia visualizarem clientes
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;
CREATE POLICY "Gestores de radiologia podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- === 20251024191515_e2d95c6a-cb48-43be-9e61-51f0f08f7b3e.sql ===
-- Adiciona "equipamento_hospitalar" ao enum categoria_patrimonio
    ALTER TYPE categoria_patrimonio ADD VALUE IF NOT EXISTS 'equipamento_hospitalar';

-- === 20251029172833_53213961-c276-4e27-8942-3800d4db331b.sql ===
-- Create unidades table
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cliente_id, nome)
);

-- Create tipo_contratacao enum
-- NESTED_REMOVED: DO $typblk$ BEGIN CREATE TYPE tipo_contratacao AS ENUM (
  'credenciamento',
  'licitacao',
  'dispensa',
  'direta_privada'
); EXCEPTION WHEN duplicate_object THEN NULL; END $typblk$;

-- Add unidade_id and tipo_contratacao to contratos table
ALTER TABLE public.contratos 
ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tipo_contratacao tipo_contratacao;

-- Create unique constraint for cliente_id + unidade_id + codigo_contrato
CREATE UNIQUE INDEX IF NOT EXISTS contratos_cliente_unidade_codigo_unique 
ON public.contratos(cliente_id, unidade_id, codigo_contrato) 
WHERE unidade_id IS NOT NULL AND codigo_contrato IS NOT NULL;

-- Create medico_vinculo_unidade table for doctor-unit-contract relationships
CREATE TABLE IF NOT EXISTS public.medico_vinculo_unidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  data_inicio DATE,
  data_fim DATE,
  status TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medico_vinculo_unidade ENABLE ROW LEVEL SECURITY;

-- RLS policies for unidades
DROP POLICY IF EXISTS "Authorized users can manage unidades" ON public.unidades;
CREATE POLICY "Authorized users can manage unidades"
ON public.unidades
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar unidades" ON public.unidades;
CREATE POLICY "Gestores de radiologia podem visualizar unidades"
ON public.unidades
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- RLS policies for medico_vinculo_unidade
DROP POLICY IF EXISTS "Authorized users can manage medico_vinculo_unidade" ON public.medico_vinculo_unidade;
CREATE POLICY "Authorized users can manage medico_vinculo_unidade"
ON public.medico_vinculo_unidade
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "Coordenadores can view medico_vinculo_unidade" ON public.medico_vinculo_unidade;
CREATE POLICY "Coordenadores can view medico_vinculo_unidade"
ON public.medico_vinculo_unidade
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'::app_role));

-- Data migration: Create "Unidade Principal" for each existing client
INSERT INTO public.unidades (cliente_id, nome, codigo)
SELECT id, 'Unidade Principal', 'UP001'
FROM public.clientes
WHERE NOT EXISTS (
  SELECT 1 FROM public.unidades WHERE unidades.cliente_id = clientes.id
);

-- Update existing contratos to point to "Unidade Principal"
UPDATE public.contratos c
SET unidade_id = (
  SELECT u.id FROM public.unidades u 
  WHERE u.cliente_id = c.cliente_id 
  AND u.nome = 'Unidade Principal'
  LIMIT 1
)
WHERE c.unidade_id IS NULL AND c.cliente_id IS NOT NULL;

-- Migrate existing medico vinculations to medico_vinculo_unidade
INSERT INTO public.medico_vinculo_unidade (
  medico_id, 
  cliente_id, 
  unidade_id, 
  contrato_id,
  status
)
SELECT 
  m.id as medico_id,
  m.cliente_vinculado_id as cliente_id,
  u.id as unidade_id,
  c.id as contrato_id,
  m.status_contrato as status
FROM public.medicos m
JOIN public.unidades u ON u.cliente_id = m.cliente_vinculado_id AND u.nome = 'Unidade Principal'
LEFT JOIN public.contratos c ON c.cliente_id = m.cliente_vinculado_id AND c.medico_id = m.id
WHERE m.cliente_vinculado_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.medico_vinculo_unidade mvu 
  WHERE mvu.medico_id = m.id AND mvu.cliente_id = m.cliente_vinculado_id
);

-- Add updated_at trigger for new tables
DROP TRIGGER IF EXISTS "update_unidades_updated_at" ON public.unidades;
CREATE TRIGGER update_unidades_updated_at
BEFORE UPDATE ON public.unidades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_medico_vinculo_unidade_updated_at" ON public.medico_vinculo_unidade;
CREATE TRIGGER update_medico_vinculo_unidade_updated_at
BEFORE UPDATE ON public.medico_vinculo_unidade
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251030144206_5e3ec0be-ef98-4aa8-8732-df00c8b1bece.sql ===
-- Criar tabela de atividades/comentários das licitações
CREATE TABLE IF NOT EXISTS public.licitacoes_atividades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('comentario', 'status_alterado', 'campo_atualizado', 'anexo_adicionado')),
  descricao TEXT NOT NULL,
  campo_alterado TEXT,
  valor_antigo TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.licitacoes_atividades ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar atividades" ON public.licitacoes_atividades;
CREATE POLICY "Usuários autenticados podem visualizar atividades"
ON public.licitacoes_atividades
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem criar atividades" ON public.licitacoes_atividades;
CREATE POLICY "Usuários autenticados podem criar atividades"
ON public.licitacoes_atividades
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_licitacoes_atividades_licitacao_id ON public.licitacoes_atividades(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_atividades_created_at ON public.licitacoes_atividades(created_at DESC);

-- === 20251030172434_879e6818-51fc-4d00-97da-502503c9a584.sql ===
-- Adicionar campo nivel_urgencia às tabelas de pendências e exames em atraso
-- e mesclar as tabelas em uma única estrutura

-- Criar tipo enum para nível de urgência
    CREATE TYPE nivel_urgencia_radiologia AS ENUM ('pronto_socorro', 'internados', 'oncologicos');

-- Adicionar campo nivel_urgencia à tabela radiologia_pendencias
ALTER TABLE radiologia_pendencias 
ADD COLUMN IF NOT EXISTS nivel_urgencia nivel_urgencia_radiologia DEFAULT 'internados';

-- Adicionar campo tipo_registro para diferenciar pendências de exames em atraso
ALTER TABLE radiologia_pendencias
ADD COLUMN IF NOT EXISTS tipo_registro text DEFAULT 'pendencia';

-- Adicionar campo exame (para quando for exame em atraso)
ALTER TABLE radiologia_pendencias
ADD COLUMN IF NOT EXISTS exame text;

-- Comentários explicativos
COMMENT ON COLUMN radiologia_pendencias.nivel_urgencia IS 'Nível de urgência: pronto_socorro (SLA 2h), internados (SLA 4h), oncologicos (SLA 48h)';
COMMENT ON COLUMN radiologia_pendencias.tipo_registro IS 'Tipo do registro: pendencia ou exame_atraso';
COMMENT ON COLUMN radiologia_pendencias.exame IS 'Nome do exame (quando tipo_registro = exame_atraso)';

-- === 20251030182410_d5796de9-a13a-4ec8-97e1-ecbe594434aa.sql ===
-- CREATE TABLE IF NOT EXISTS for dynamic Kanban status configuration
CREATE TABLE IF NOT EXISTS public.kanban_status_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  status_id text NOT NULL,
  label text NOT NULL,
  ordem integer NOT NULL,
  cor text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(modulo, status_id)
);

-- CREATE INDEX IF NOT EXISTSes for better performance
CREATE INDEX IF NOT EXISTS idx_kanban_status_modulo ON public.kanban_status_config(modulo);
CREATE INDEX IF NOT EXISTS idx_kanban_status_ordem ON public.kanban_status_config(modulo, ordem);

-- Enable RLS
ALTER TABLE public.kanban_status_config ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view status
DROP POLICY IF EXISTS "Authenticated users can view kanban status" ON public.kanban_status_config;
CREATE POLICY "Authenticated users can view kanban status"
  ON public.kanban_status_config FOR SELECT
  USING (true);

-- Policy: Only admins can manage status
DROP POLICY IF EXISTS "Admins can manage kanban status" ON public.kanban_status_config;
CREATE POLICY "Admins can manage kanban status"
  ON public.kanban_status_config FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS "update_kanban_status_config_updated_at" ON public.kanban_status_config;
CREATE TRIGGER update_kanban_status_config_updated_at
  BEFORE UPDATE ON public.kanban_status_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert initial data for licitacoes module
INSERT INTO public.kanban_status_config (modulo, status_id, label, ordem) VALUES
('licitacoes', 'captacao_edital', 'Captação de edital', 1),
('licitacoes', 'edital_analise', 'Edital em análise', 2),
('licitacoes', 'deliberacao', 'Deliberação', 3),
('licitacoes', 'esclarecimentos_impugnacao', 'Esclarecimentos/Impugnação', 4),
('licitacoes', 'cadastro_proposta', 'Cadastro de proposta', 5),
('licitacoes', 'aguardando_sessao', 'Aguardando sessão', 6),
('licitacoes', 'em_disputa', 'Em disputa', 7),
('licitacoes', 'proposta_final', 'Proposta final', 8),
('licitacoes', 'recurso_contrarrazao', 'Recurso/Contrarrazão', 9),
('licitacoes', 'adjudicacao_homologacao', 'Adjudicação/Homologação', 10),
('licitacoes', 'arrematados', 'Arrematados', 11),
('licitacoes', 'descarte_edital', 'Descarte de edital', 12),
('licitacoes', 'nao_ganhamos', 'Não ganhamos', 13);

-- === 20251031114250_9c3d69bb-ea90-4966-8540-5e6666d3a342.sql ===
-- Adicionar campo is_externo à tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios 
ADD COLUMN IF NOT EXISTS is_externo BOOLEAN DEFAULT false;

-- Adicionar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_suporte_comentarios_ticket_id 
ON public.suporte_comentarios(ticket_id);

CREATE INDEX IF NOT EXISTS idx_suporte_comentarios_created_at 
ON public.suporte_comentarios(created_at);

-- Comentário explicativo
COMMENT ON COLUMN public.suporte_comentarios.is_externo IS 'Indica se o comentário veio de uma resposta de e-mail externa';

-- === 20251031114515_9efafde1-d445-4d18-8e3e-e3279ae6dda2.sql ===
-- Adicionar campo autor_email à tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios 
ADD COLUMN IF NOT EXISTS autor_email TEXT;

-- Tornar autor_id nullable para permitir comentários de emails externos
ALTER TABLE public.suporte_comentarios 
ALTER COLUMN autor_id DROP NOT NULL;

-- Atualizar RLS policies para permitir inserção de comentários externos (via edge function)
DROP POLICY IF EXISTS "Users can create comments on their tickets" ON public.suporte_comentarios;

DROP POLICY IF EXISTS "Users can create comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
WITH CHECK (
  (auth.uid() = autor_id AND EXISTS (
    SELECT 1 FROM suporte_tickets
    WHERE suporte_tickets.id = suporte_comentarios.ticket_id
    AND (suporte_tickets.solicitante_id = auth.uid() OR is_admin(auth.uid()))
  ))
  OR
  -- Permitir inserção via service role (edge functions) para comentários externos
  auth.role() = 'service_role'
);

-- Comentários
COMMENT ON COLUMN public.suporte_comentarios.autor_email IS 'Email do autor do comentário (usado para comentários externos)';

-- === 20251031134319_42046f09-5174-4f3a-9f6a-58ad3b5ec48f.sql ===
-- Criar tabela para gerenciar colunas do Kanban de licitações
CREATE TABLE IF NOT EXISTS public.licitacoes_colunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  status_vinculado status_licitacao NOT NULL UNIQUE,
  ordem INTEGER NOT NULL,
  cor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licitacoes_colunas ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar colunas" ON public.licitacoes_colunas;
CREATE POLICY "Usuários autenticados podem visualizar colunas"
  ON public.licitacoes_colunas
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar colunas" ON public.licitacoes_colunas;
CREATE POLICY "Usuários autorizados podem gerenciar colunas"
  ON public.licitacoes_colunas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role)
  );

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_licitacoes_colunas_updated_at" ON public.licitacoes_colunas;
CREATE TRIGGER update_licitacoes_colunas_updated_at
  BEFORE UPDATE ON public.licitacoes_colunas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Popular com as colunas existentes (IDs fixos correspondendo aos status reais)
INSERT INTO public.licitacoes_colunas (id, nome, status_vinculado, ordem, cor) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Captação de edital', 'captacao_edital', 1, '#3b82f6'),
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Análise de edital', 'edital_analise', 2, '#8b5cf6'),
  ('b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 'Esclarecimentos/Impugnação', 'esclarecimentos_impugnacao', 3, '#ec4899'),
  ('c3d4e5f6-a7b8-4c5d-0e1f-2a3b4c5d6e7f', 'Cadastro de proposta', 'cadastro_proposta', 4, '#f59e0b'),
  ('d4e5f6a7-b8c9-4d5e-1f2a-3b4c5d6e7f8a', 'Proposta final', 'proposta_final', 5, '#10b981'),
  ('e5f6a7b8-c9d0-4e5f-2a3b-4c5d6e7f8a9b', 'Aguardando sessão', 'aguardando_sessao', 6, '#06b6d4'),
  ('f6a7b8c9-d0e1-4f5a-3b4c-5d6e7f8a9b0c', 'Em disputa', 'em_disputa', 7, '#6366f1'),
  ('a7b8c9d0-e1f2-4a5b-4c5d-6e7f8a9b0c1d', 'Deliberação', 'deliberacao', 8, '#a855f7'),
  ('b8c9d0e1-f2a3-4b5c-5d6e-7f8a9b0c1d2e', 'Recurso/Contrarrazão', 'recurso_contrarrazao', 9, '#f97316'),
  ('c9d0e1f2-a3b4-4c5d-6e7f-8a9b0c1d2e3f', 'Adjudicação/Homologação', 'adjudicacao_homologacao', 10, '#22c55e'),
  ('d0e1f2a3-b4c5-4d5e-7f8a-9b0c1d2e3f4a', 'Arrematados', 'arrematados', 11, '#16a34a'),
  ('e1f2a3b4-c5d6-4e5f-8a9b-0c1d2e3f4a5b', 'Não ganhamos', 'nao_ganhamos', 12, '#ef4444'),
  ('f2a3b4c5-d6e7-4f5a-9b0c-1d2e3f4a5b6c', 'Descarte de edital', 'descarte_edital', 13, '#64748b')
ON CONFLICT (status_vinculado) DO NOTHING;

-- === 20251031145556_a085c3ca-0bb3-4f02-9cc9-d8efaff64731.sql ===
-- Add missing status value to status_licitacao ENUM
    ALTER TYPE status_licitacao ADD VALUE IF NOT EXISTS 'capitacao_de_credenciamento';

-- === 20251031162910_3f76362e-5bac-401a-b98c-66e9d582e3da.sql ===
-- Criar tabela para anotações de prontuário dos médicos
CREATE TABLE IF NOT EXISTS public.medico_prontuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  anotacao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_prontuario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Usuários podem ver prontuários" ON public.medico_prontuario;
CREATE POLICY "Usuários podem ver prontuários"
ON public.medico_prontuario
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários podem criar prontuários" ON public.medico_prontuario;
CREATE POLICY "Usuários podem criar prontuários"
ON public.medico_prontuario
FOR INSERT
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Usuários podem atualizar próprios prontuários" ON public.medico_prontuario;
CREATE POLICY "Usuários podem atualizar próprios prontuários"
ON public.medico_prontuario
FOR UPDATE
USING (auth.uid() = created_by);

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_medico_prontuario_medico_id ON public.medico_prontuario(medico_id);
CREATE INDEX IF NOT EXISTS idx_medico_prontuario_created_at ON public.medico_prontuario(created_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_medico_prontuario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trigger_update_medico_prontuario_updated_at" ON public.medico_prontuario;
CREATE TRIGGER trigger_update_medico_prontuario_updated_at
BEFORE UPDATE ON public.medico_prontuario
FOR EACH ROW
EXECUTE FUNCTION update_medico_prontuario_updated_at();

-- === 20251031163248_0e1ce4d1-374c-4a37-ae31-b71f75492f09.sql ===
-- Corrigir search_path para função de prontuário
DROP TRIGGER IF EXISTS trigger_update_medico_prontuario_updated_at ON public.medico_prontuario;
DROP FUNCTION IF EXISTS update_medico_prontuario_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_medico_prontuario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS "trigger_update_medico_prontuario_updated_at" ON public.medico_prontuario;
CREATE TRIGGER trigger_update_medico_prontuario_updated_at
BEFORE UPDATE ON public.medico_prontuario
FOR EACH ROW
EXECUTE FUNCTION update_medico_prontuario_updated_at();

-- === 20251031174051_9dcf9493-50ef-45a8-9319-a14a42fca9a9.sql ===
-- Criar bucket de storage para documentos dos médicos
INSERT INTO storage.buckets (id, name, public)
VALUES ('medicos-documentos', 'medicos-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para documentos dos médicos
DROP POLICY IF EXISTS "Usuários autenticados podem ver documentos" ON storage.objects;
CREATE POLICY "Usuários autenticados podem ver documentos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'medicos-documentos');

DROP POLICY IF EXISTS "Usuários autorizados podem fazer upload" ON storage.objects;
CREATE POLICY "Usuários autorizados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

DROP POLICY IF EXISTS "Usuários autorizados podem atualizar documentos" ON storage.objects;
CREATE POLICY "Usuários autorizados podem atualizar documentos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

DROP POLICY IF EXISTS "Usuários autorizados podem deletar documentos" ON storage.objects;
CREATE POLICY "Usuários autorizados podem deletar documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'medicos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

-- Tipos de documento
-- NESTED_REMOVED: DO $typblk$ BEGIN CREATE TYPE tipo_documento_medico AS ENUM (
  'diploma',
  'certificado',
  'rg',
  'cpf',
  'crm',
  'rqe',
  'titulo_especialista',
  'comprovante_residencia',
  'certidao',
  'carta_recomendacao',
  'outro'
); EXCEPTION WHEN duplicate_object THEN NULL; END $typblk$;

-- Tabela de documentos dos médicos
CREATE TABLE IF NOT EXISTS public.medico_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  arquivo_path TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  tipo_documento tipo_documento_medico NOT NULL,
  emissor TEXT,
  data_emissao DATE,
  data_validade DATE,
  observacoes TEXT,
  texto_extraido TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_documentos ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para documentos
DROP POLICY IF EXISTS "Usuários autenticados podem ver documentos" ON public.medico_documentos;
CREATE POLICY "Usuários autenticados podem ver documentos"
ON public.medico_documentos FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Usuários autorizados podem inserir documentos" ON public.medico_documentos;
CREATE POLICY "Usuários autorizados podem inserir documentos"
ON public.medico_documentos FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem atualizar documentos" ON public.medico_documentos;
CREATE POLICY "Usuários autorizados podem atualizar documentos"
ON public.medico_documentos FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);