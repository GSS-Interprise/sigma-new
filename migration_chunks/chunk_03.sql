
DROP POLICY IF EXISTS "Usuários autorizados podem deletar documentos" ON public.medico_documentos;
CREATE POLICY "Usuários autorizados podem deletar documentos"
ON public.medico_documentos FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Tabela de logs de auditoria de documentos
CREATE TABLE IF NOT EXISTS public.medico_documentos_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID REFERENCES public.medico_documentos(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL, -- 'upload', 'download', 'update', 'delete', 'view'
  detalhes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_documentos_log ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para logs
DROP POLICY IF EXISTS "Usuários autenticados podem ver logs" ON public.medico_documentos_log;
CREATE POLICY "Usuários autenticados podem ver logs"
ON public.medico_documentos_log FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.medico_documentos_log;
CREATE POLICY "Sistema pode inserir logs"
ON public.medico_documentos_log FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

-- Adicionar coluna para resumo IA no médico
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS resumo_ia TEXT,
ADD COLUMN IF NOT EXISTS resumo_ia_gerado_em TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resumo_ia_gerado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado_por UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS resumo_ia_aprovado_em TIMESTAMPTZ;

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_medico_documentos_updated_at" ON public.medico_documentos;
CREATE TRIGGER update_medico_documentos_updated_at
  BEFORE UPDATE ON public.medico_documentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_medico_documentos_medico_id ON public.medico_documentos(medico_id);
CREATE INDEX IF NOT EXISTS idx_medico_documentos_tipo ON public.medico_documentos(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_medico_documentos_validade ON public.medico_documentos(data_validade);
CREATE INDEX IF NOT EXISTS idx_medico_documentos_log_medico_id ON public.medico_documentos_log(medico_id);
CREATE INDEX IF NOT EXISTS idx_medico_documentos_log_documento_id ON public.medico_documentos_log(documento_id);

-- === 20251031185624_16f1033c-17f3-4ae6-ad64-e0e4220e7c76.sql ===
-- Garantir que o bucket existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('medicos-documentos', 'medicos-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem baixar" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar" ON storage.objects;

-- Criar policies para storage
DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload" ON storage.objects;
CREATE POLICY "Usuários autenticados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'medicos-documentos');

DROP POLICY IF EXISTS "Usuários autenticados podem baixar" ON storage.objects;
CREATE POLICY "Usuários autenticados podem baixar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'medicos-documentos');

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar" ON storage.objects;
CREATE POLICY "Usuários autenticados podem atualizar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'medicos-documentos');

DROP POLICY IF EXISTS "Usuários autenticados podem deletar" ON storage.objects;
CREATE POLICY "Usuários autenticados podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'medicos-documentos');

-- Garantir que a tabela medico_documentos tenha RLS habilitado
ALTER TABLE medico_documentos ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS "Usuários autenticados podem ver documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar documentos" ON medico_documentos;

-- Criar policies para tabela
DROP POLICY IF EXISTS "Usuários autenticados podem ver documentos" ON medico_documentos;
CREATE POLICY "Usuários autenticados podem ver documentos"
ON medico_documentos FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir documentos" ON medico_documentos;
CREATE POLICY "Usuários autenticados podem inserir documentos"
ON medico_documentos FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar documentos" ON medico_documentos;
CREATE POLICY "Usuários autenticados podem atualizar documentos"
ON medico_documentos FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar documentos" ON medico_documentos;
CREATE POLICY "Usuários autenticados podem deletar documentos"
ON medico_documentos FOR DELETE
TO authenticated
USING (true);

-- === 20251106124806_54e29c06-c3c2-450f-bb92-2b5c3331f7a9.sql ===
-- Criar tabela de canais de comunicação
CREATE TABLE IF NOT EXISTS public.comunicacao_canais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'grupo', -- 'grupo', 'direto'
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de participantes dos canais
CREATE TABLE IF NOT EXISTS public.comunicacao_participantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_leitura TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(canal_id, user_id)
);

-- Criar tabela de mensagens
CREATE TABLE IF NOT EXISTS public.comunicacao_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  anexos TEXT[],
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de status de leitura das mensagens
CREATE TABLE IF NOT EXISTS public.comunicacao_leituras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mensagem_id UUID NOT NULL REFERENCES public.comunicacao_mensagens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  data_leitura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(mensagem_id, user_id)
);

-- Criar tabela de notificações
CREATE TABLE IF NOT EXISTS public.comunicacao_notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  mensagem_id UUID NOT NULL REFERENCES public.comunicacao_mensagens(id) ON DELETE CASCADE,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comunicacao_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_notificacoes ENABLE ROW LEVEL SECURITY;

-- RLS Policies para canais
DROP POLICY IF EXISTS "Users can view channels they participate in" ON public.comunicacao_canais;
CREATE POLICY "Users can view channels they participate in"
  ON public.comunicacao_canais FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_canais.id AND user_id = auth.uid()
    ) OR criado_por = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create channels" ON public.comunicacao_canais;
CREATE POLICY "Users can create channels"
  ON public.comunicacao_canais FOR INSERT
  WITH CHECK (auth.uid() = criado_por);

DROP POLICY IF EXISTS "Channel creators can update their channels" ON public.comunicacao_canais;
CREATE POLICY "Channel creators can update their channels"
  ON public.comunicacao_canais FOR UPDATE
  USING (auth.uid() = criado_por);

-- RLS Policies para participantes
DROP POLICY IF EXISTS "Users can view participants in their channels" ON public.comunicacao_participantes;
CREATE POLICY "Users can view participants in their channels"
  ON public.comunicacao_participantes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes cp2
      WHERE cp2.canal_id = comunicacao_participantes.canal_id 
      AND cp2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Channel creators can add participants" ON public.comunicacao_participantes;
CREATE POLICY "Channel creators can add participants"
  ON public.comunicacao_participantes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comunicacao_canais
      WHERE id = canal_id AND criado_por = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own participation" ON public.comunicacao_participantes;
CREATE POLICY "Users can update their own participation"
  ON public.comunicacao_participantes FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies para mensagens
DROP POLICY IF EXISTS "Users can view messages in their channels" ON public.comunicacao_mensagens;
CREATE POLICY "Users can view messages in their channels"
  ON public.comunicacao_mensagens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_mensagens.canal_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants can send messages" ON public.comunicacao_mensagens;
CREATE POLICY "Participants can send messages"
  ON public.comunicacao_mensagens FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_mensagens.canal_id AND user_id = auth.uid()
    )
  );

-- RLS Policies para leituras
DROP POLICY IF EXISTS "Users can view message read status in their channels" ON public.comunicacao_leituras;
CREATE POLICY "Users can view message read status in their channels"
  ON public.comunicacao_leituras FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_mensagens m
      JOIN public.comunicacao_participantes p ON p.canal_id = m.canal_id
      WHERE m.id = comunicacao_leituras.mensagem_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can mark messages as read" ON public.comunicacao_leituras;
CREATE POLICY "Users can mark messages as read"
  ON public.comunicacao_leituras FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies para notificações
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.comunicacao_notificacoes;
CREATE POLICY "Users can view their own notifications"
  ON public.comunicacao_notificacoes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON public.comunicacao_notificacoes;
CREATE POLICY "System can create notifications"
  ON public.comunicacao_notificacoes FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.comunicacao_notificacoes;
CREATE POLICY "Users can update their own notifications"
  ON public.comunicacao_notificacoes FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_comunicacao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "update_comunicacao_canais_updated_at" ON public.comunicacao_canais;
CREATE TRIGGER update_comunicacao_canais_updated_at
  BEFORE UPDATE ON public.comunicacao_canais
  FOR EACH ROW EXECUTE FUNCTION public.update_comunicacao_updated_at();

DROP TRIGGER IF EXISTS "update_comunicacao_mensagens_updated_at" ON public.comunicacao_mensagens;
CREATE TRIGGER update_comunicacao_mensagens_updated_at
  BEFORE UPDATE ON public.comunicacao_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.update_comunicacao_updated_at();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_leituras;

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('comunicacao-anexos', 'comunicacao-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for comunicacao-anexos
DROP POLICY IF EXISTS "Users can upload attachments to their channels" ON storage.objects;
CREATE POLICY "Users can upload attachments to their channels"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comunicacao-anexos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can view attachments in their channels" ON storage.objects;
CREATE POLICY "Users can view attachments in their channels"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comunicacao-anexos');

DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;
CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'comunicacao-anexos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- === 20251106124925_4a643803-6e54-45fc-a294-454609df3760.sql ===
-- Fix security warnings: set search_path on functions
CREATE OR REPLACE FUNCTION public.update_comunicacao_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- === 20251106133751_0a2dd2e3-1d5b-4acc-925c-08e0be34689c.sql ===
-- Drop the problematic RLS policy
DROP POLICY IF EXISTS "Users can view participants in their channels" ON comunicacao_participantes;

-- Create a security definer function to check if user is a channel participant
CREATE OR REPLACE FUNCTION public.is_channel_participant(_user_id uuid, _canal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM comunicacao_participantes
    WHERE user_id = _user_id
      AND canal_id = _canal_id
  )
$$;

-- Recreate the policy using the security definer function
DROP POLICY IF EXISTS "Users can view participants in their channels" ON comunicacao_participantes;
CREATE POLICY "Users can view participants in their channels"
ON comunicacao_participantes
FOR SELECT
USING (public.is_channel_participant(auth.uid(), canal_id));

-- === 20251106165334_89ab4dbf-195f-4a37-ab6b-c808ddf8a969.sql ===
-- Criar tabela de conversas
CREATE TABLE IF NOT EXISTS public.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conversa text UNIQUE NOT NULL,
  nome_contato text NOT NULL,
  numero_contato text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Criar tabela de mensagens
CREATE TABLE IF NOT EXISTS public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_pai uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  texto_mensagem text NOT NULL,
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  timestamp timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_conversas_id_conversa ON public.conversas(id_conversa);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_pai ON public.mensagens(conversa_pai);
CREATE INDEX IF NOT EXISTS idx_mensagens_timestamp ON public.mensagens(timestamp DESC);

-- Habilitar RLS
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para conversas
DROP POLICY IF EXISTS "Authenticated users can view conversas" ON public.conversas;
CREATE POLICY "Authenticated users can view conversas"
  ON public.conversas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert conversas" ON public.conversas;
CREATE POLICY "Authenticated users can insert conversas"
  ON public.conversas FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update conversas" ON public.conversas;
CREATE POLICY "Authenticated users can update conversas"
  ON public.conversas FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas RLS para mensagens
DROP POLICY IF EXISTS "Authenticated users can view mensagens" ON public.mensagens;
CREATE POLICY "Authenticated users can view mensagens"
  ON public.mensagens FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert mensagens" ON public.mensagens;
CREATE POLICY "Authenticated users can insert mensagens"
  ON public.mensagens FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_conversas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "update_conversas_updated_at" ON public.conversas;
CREATE TRIGGER update_conversas_updated_at
  BEFORE UPDATE ON public.conversas
  FOR EACH ROW
  EXECUTE FUNCTION update_conversas_updated_at();

-- === 20251106193841_6d7b857d-f0ea-4fc1-bbb9-aada1f0ba044.sql ===
-- Adicionar constraint UNIQUE para evitar conversas duplicadas
ALTER TABLE public.conversas
ADD CONSTRAINT conversas_id_conversa_unique UNIQUE (id_conversa);

-- === 20251107182140_f10acd8d-4f2a-4b70-874d-ab5a32040101.sql ===
-- Criar enum para motivos de ausência
DO $typblk$ BEGIN CREATE TYPE public.motivo_ausencia AS ENUM (
  'ferias',
  'atestado_medico',
  'congresso',
  'viagem',
  'folga',
  'outro'
); EXCEPTION WHEN duplicate_object THEN NULL; END $typblk$;

-- Tabela de ausências de médicos
CREATE TABLE IF NOT EXISTS public.medico_ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo public.motivo_ausencia NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  medico_substituto_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_ausencias ENABLE ROW LEVEL SECURITY;

-- Política para visualizar ausências
DROP POLICY IF EXISTS "Usuários autenticados podem ver ausências" ON public.medico_ausencias;
CREATE POLICY "Usuários autenticados podem ver ausências"
ON public.medico_ausencias
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciar ausências
DROP POLICY IF EXISTS "Gestores podem gerenciar ausências" ON public.medico_ausencias;
CREATE POLICY "Gestores podem gerenciar ausências"
ON public.medico_ausencias
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'coordenador_escalas')
);

-- Tabela de remuneração de médicos
CREATE TABLE IF NOT EXISTS public.medico_remuneracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  exame_servico TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_remuneracao ENABLE ROW LEVEL SECURITY;

-- Política para visualizar remuneração
DROP POLICY IF EXISTS "Usuários autenticados podem ver remuneração" ON public.medico_remuneracao;
CREATE POLICY "Usuários autenticados podem ver remuneração"
ON public.medico_remuneracao
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciar remuneração
DROP POLICY IF EXISTS "Gestores podem gerenciar remuneração" ON public.medico_remuneracao;
CREATE POLICY "Gestores podem gerenciar remuneração"
ON public.medico_remuneracao
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'gestor_financeiro')
);

-- Tabela para escalas geradas a partir das agendas
CREATE TABLE IF NOT EXISTS public.radiologia_agendas_escalas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES public.radiologia_agendas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  total_horas NUMERIC(5, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  concluido BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.radiologia_agendas_escalas ENABLE ROW LEVEL SECURITY;

-- Política para gerenciar escalas
DROP POLICY IF EXISTS "Gestores podem gerenciar escalas" ON public.radiologia_agendas_escalas;
CREATE POLICY "Gestores podem gerenciar escalas"
ON public.radiologia_agendas_escalas
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_radiologia')
);

-- Adicionar campos à tabela radiologia_agendas
ALTER TABLE public.radiologia_agendas 
ADD COLUMN exame_servico TEXT,
ADD COLUMN data_inicio DATE,
ADD COLUMN data_fim DATE,
ADD COLUMN total_horas_dia NUMERIC(5, 2);

-- Atualizar registros existentes
UPDATE public.radiologia_agendas 
SET data_inicio = data_agenda,
    data_fim = data_agenda
WHERE data_inicio IS NULL;

-- Tabela para comparação de produção (hospital vs GSS)
CREATE TABLE IF NOT EXISTS public.radiologia_producao_comparacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  exames_hospital INTEGER NOT NULL DEFAULT 0,
  exames_gss INTEGER NOT NULL DEFAULT 0,
  diferenca INTEGER GENERATED ALWAYS AS (exames_gss - exames_hospital) STORED,
  status TEXT NOT NULL DEFAULT 'pendente',
  arquivo_hospital_url TEXT,
  arquivo_gss_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.radiologia_producao_comparacao ENABLE ROW LEVEL SECURITY;

-- Política para gerenciar comparações
DROP POLICY IF EXISTS "Gestores podem gerenciar comparações" ON public.radiologia_producao_comparacao;
CREATE POLICY "Gestores podem gerenciar comparações"
ON public.radiologia_producao_comparacao
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_radiologia')
);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_medico_ausencias_updated_at" ON public.medico_ausencias;
CREATE TRIGGER update_medico_ausencias_updated_at
BEFORE UPDATE ON public.medico_ausencias
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_medico_remuneracao_updated_at" ON public.medico_remuneracao;
CREATE TRIGGER update_medico_remuneracao_updated_at
BEFORE UPDATE ON public.medico_remuneracao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_agendas_escalas_updated_at" ON public.radiologia_agendas_escalas;
CREATE TRIGGER update_radiologia_agendas_escalas_updated_at
BEFORE UPDATE ON public.radiologia_agendas_escalas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_radiologia_producao_comparacao_updated_at" ON public.radiologia_producao_comparacao;
CREATE TRIGGER update_radiologia_producao_comparacao_updated_at
BEFORE UPDATE ON public.radiologia_producao_comparacao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251107190708_d8a63174-6bc9-4611-af3a-2625d33f6185.sql ===
-- Add updated_at column to effect_sync_logs table
ALTER TABLE public.effect_sync_logs 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- === 20251112154853_472e1157-0ffe-4a1f-9bb2-5ed3d799867b.sql ===
-- Adicionar novo status "aguardando_confirmacao" ao enum status_ticket
    ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_confirmacao';

-- Adicionar novo status "resolvido" ao enum status_ticket  
    ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'resolvido';

-- === 20251113115645_82903b74-6c9f-476e-85c2-64aedbae5591.sql ===
-- Adicionar coluna email na tabela leads
ALTER TABLE public.leads 
ADD COLUMN email text;

-- Adicionar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);

-- Adicionar comentário
COMMENT ON COLUMN public.leads.email IS 'E-mail do lead para campanhas por e-mail';

-- === 20251113125632_5ebcd6eb-6a77-4e36-9889-92cd1ff01a98.sql ===
-- Criar tabela de anotações gerais para o módulo de disparos
CREATE TABLE IF NOT EXISTS public.disparos_anotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  texto_anotacao TEXT NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar índices para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_cliente_id ON public.disparos_anotacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_data_hora ON public.disparos_anotacoes(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_texto ON public.disparos_anotacoes USING gin(to_tsvector('portuguese', texto_anotacao));

-- Habilitar RLS
ALTER TABLE public.disparos_anotacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Usuários autenticados podem ver anotações" ON public.disparos_anotacoes;
CREATE POLICY "Usuários autenticados podem ver anotações"
  ON public.disparos_anotacoes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem criar anotações" ON public.disparos_anotacoes;
CREATE POLICY "Usuários autenticados podem criar anotações"
  ON public.disparos_anotacoes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuários podem editar suas próprias anotações" ON public.disparos_anotacoes;
CREATE POLICY "Usuários podem editar suas próprias anotações"
  ON public.disparos_anotacoes
  FOR UPDATE
  USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Usuários podem deletar suas próprias anotações" ON public.disparos_anotacoes;
CREATE POLICY "Usuários podem deletar suas próprias anotações"
  ON public.disparos_anotacoes
  FOR DELETE
  USING (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_disparos_anotacoes_updated_at" ON public.disparos_anotacoes;
CREATE TRIGGER update_disparos_anotacoes_updated_at
  BEFORE UPDATE ON public.disparos_anotacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251113133215_b19568e5-4d2d-4d53-a112-034b0189458e.sql ===
-- Adicionar campo tipo_disparo nas tabelas de disparos
ALTER TABLE disparos_programados 
ADD COLUMN IF NOT EXISTS tipo_disparo TEXT DEFAULT 'whatsapp' CHECK (tipo_disparo IN ('whatsapp', 'email'));

ALTER TABLE disparos_log 
ADD COLUMN IF NOT EXISTS tipo_disparo TEXT DEFAULT 'whatsapp' CHECK (tipo_disparo IN ('whatsapp', 'email'));

-- Adicionar campos específicos para email
ALTER TABLE disparos_programados
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_email TEXT;

ALTER TABLE disparos_log
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_email TEXT;

-- === 20251113134201_5066a449-5e56-4a13-bda5-4b1f39c07ac7.sql ===
-- Adicionar coluna email na tabela leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS email TEXT;

-- === 20251113144809_afebeb35-1c0e-4df7-9044-bad78b9e365b.sql ===

-- Criar tabela para armazenar respostas de email
CREATE TABLE IF NOT EXISTS public.email_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  disparo_log_id UUID REFERENCES public.disparos_log(id) ON DELETE SET NULL,
  disparo_programado_id UUID REFERENCES public.disparos_programados(id) ON DELETE SET NULL,
  remetente_email TEXT NOT NULL,
  remetente_nome TEXT,
  data_resposta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  conteudo_resposta TEXT NOT NULL,
  status_lead TEXT NOT NULL DEFAULT 'novo',
  medico_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  especialidade TEXT,
  localidade TEXT,
  observacoes TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false,
  concluido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT email_respostas_status_check CHECK (status_lead IN ('novo', 'em_analise', 'concluido', 'descartado'))
);

-- Habilitar RLS
ALTER TABLE public.email_respostas ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar respostas" ON public.email_respostas;
CREATE POLICY "Usuários autorizados podem gerenciar respostas"
  ON public.email_respostas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

DROP POLICY IF EXISTS "Sistema pode inserir respostas" ON public.email_respostas;
CREATE POLICY "Sistema pode inserir respostas"
  ON public.email_respostas
  FOR INSERT
  WITH CHECK (true);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_email_respostas_updated_at" ON public.email_respostas;
CREATE TRIGGER update_email_respostas_updated_at
  BEFORE UPDATE ON public.email_respostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_email_respostas_disparo_log ON public.email_respostas(disparo_log_id);
CREATE INDEX IF NOT EXISTS idx_email_respostas_disparo_programado ON public.email_respostas(disparo_programado_id);
CREATE INDEX IF NOT EXISTS idx_email_respostas_status ON public.email_respostas(status_lead);
CREATE INDEX IF NOT EXISTS idx_email_respostas_remetente ON public.email_respostas(remetente_email);
CREATE INDEX IF NOT EXISTS idx_email_respostas_data ON public.email_respostas(data_resposta DESC);

-- Adicionar comentários
COMMENT ON TABLE public.email_respostas IS 'Armazena respostas de emails recebidas dos disparos';
COMMENT ON COLUMN public.email_respostas.status_lead IS 'Status do lead: novo, em_analise, concluido, descartado';


-- === 20251113173835_59a44538-2ef1-4f04-a8cf-761b424856ee.sql ===
-- Adicionar gestor_marketing ao enum app_role
    ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_marketing';

-- === 20251113174802_491b4487-8ccb-46ac-82bc-30ceec0b9c9f.sql ===
-- Criar enum para status de campanha
    CREATE TYPE status_campanha AS ENUM ('planejada', 'ativa', 'pausada', 'finalizada');

-- Criar enum para canais de campanha
    CREATE TYPE canal_campanha AS ENUM ('whatsapp', 'email', 'instagram', 'linkedin', 'anuncios', 'eventos');

-- Criar enum para tipo de conteúdo
    CREATE TYPE tipo_conteudo AS ENUM ('video', 'card', 'reels', 'artigo', 'newsletter');

-- Criar enum para status de conteúdo
    CREATE TYPE status_conteudo AS ENUM ('rascunho', 'pronto', 'publicado');

-- Criar enum para etapas do funil
-- NESTED_REMOVED: DO $typblk$ BEGIN CREATE TYPE etapa_funil_marketing AS ENUM (
  'lead_gerado',
  'contato_inicial',
  'envio_informacoes',
  'qualificacao',
  'encaminhado_captacao',
  'processo_contratacao',
  'plantao_agendado'
); EXCEPTION WHEN duplicate_object THEN NULL; END $typblk$;

-- Criar enum para categoria de material
    CREATE TYPE categoria_material AS ENUM ('pdf', 'apresentacao', 'modelo_mensagem', 'logo', 'template', 'politica_interna');

-- Tabela de Campanhas
CREATE TABLE IF NOT EXISTS public.campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  objetivo TEXT,
  publico_alvo JSONB,
  canal canal_campanha NOT NULL,
  status status_campanha NOT NULL DEFAULT 'planejada',
  data_inicio DATE,
  data_termino DATE,
  orcamento NUMERIC(12, 2),
  responsavel_id UUID REFERENCES auth.users(id),
  setores_vinculados TEXT[],
  empresas_vinculadas UUID[],
  pecas_url TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Conteúdos
CREATE TABLE IF NOT EXISTS public.conteudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  tipo tipo_conteudo NOT NULL,
  data_publicacao DATE,
  status status_conteudo NOT NULL DEFAULT 'rascunho',
  tags TEXT[],
  alcance INTEGER,
  cliques INTEGER,
  engajamento NUMERIC(5, 2),
  anexos TEXT[],
  observacoes TEXT,
  responsavel_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Funil de Marketing (Leads)
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  especialidade TEXT,
  cidade TEXT,
  telefone TEXT,
  email TEXT,
  origem_campanha_id UUID REFERENCES public.campanhas(id),
  etapa etapa_funil_marketing NOT NULL DEFAULT 'lead_gerado',
  tags TEXT[],
  observacoes TEXT,
  documentos_url TEXT[],
  responsavel_id UUID REFERENCES auth.users(id),
  historico_interacoes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Biblioteca de Materiais
CREATE TABLE IF NOT EXISTS public.materiais_biblioteca (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria categoria_material NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  pasta TEXT,
  tags TEXT[],
  descricao TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Eventos
CREATE TABLE IF NOT EXISTS public.eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  data_evento DATE NOT NULL,
  orcamento NUMERIC(12, 2),
  participantes TEXT[],
  materiais_usados TEXT[],
  pecas_divulgacao TEXT[],
  leads_gerados INTEGER DEFAULT 0,
  relatorio_pos_evento TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Parceiros (CRM)
CREATE TABLE IF NOT EXISTS public.parceiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  cnpj TEXT,
  contatos_principais JSONB,
  historico_interacoes JSONB DEFAULT '[]'::jsonb,
  materiais_enviados TEXT[],
  oportunidades JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Automações
CREATE TABLE IF NOT EXISTS public.automacoes_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  trigger_etapa etapa_funil_marketing,
  acao TEXT NOT NULL,
  webhook_url TEXT,
  config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_biblioteca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para campanhas
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar campanhas" ON public.campanhas;
CREATE POLICY "Usuários autorizados podem gerenciar campanhas"
  ON public.campanhas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para conteudos
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar conteudos" ON public.conteudos;
CREATE POLICY "Usuários autorizados podem gerenciar conteudos"
  ON public.conteudos
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para marketing_leads
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar leads de marketing" ON public.marketing_leads;
CREATE POLICY "Usuários autorizados podem gerenciar leads de marketing"
  ON public.marketing_leads
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para materiais_biblioteca
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar materiais" ON public.materiais_biblioteca;
CREATE POLICY "Usuários autenticados podem visualizar materiais"
  ON public.materiais_biblioteca
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem inserir materiais" ON public.materiais_biblioteca;
CREATE POLICY "Usuários autorizados podem inserir materiais"
  ON public.materiais_biblioteca
  FOR INSERT
  WITH CHECK (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

DROP POLICY IF EXISTS "Usuários autorizados podem atualizar materiais" ON public.materiais_biblioteca;
CREATE POLICY "Usuários autorizados podem atualizar materiais"
  ON public.materiais_biblioteca
  FOR UPDATE
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

DROP POLICY IF EXISTS "Usuários autorizados podem deletar materiais" ON public.materiais_biblioteca;
CREATE POLICY "Usuários autorizados podem deletar materiais"
  ON public.materiais_biblioteca
  FOR DELETE
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

-- Políticas RLS para eventos
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar eventos" ON public.eventos;
CREATE POLICY "Usuários autorizados podem gerenciar eventos"
  ON public.eventos
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para parceiros
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar parceiros" ON public.parceiros;
CREATE POLICY "Usuários autorizados podem gerenciar parceiros"
  ON public.parceiros
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para automacoes_config
DROP POLICY IF EXISTS "Admins e gestores marketing podem gerenciar automações" ON public.automacoes_config;
CREATE POLICY "Admins e gestores marketing podem gerenciar automações"
  ON public.automacoes_config
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

-- Criar storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campanhas-pecas', 'campanhas-pecas', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('materiais-biblioteca', 'materiais-biblioteca', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('eventos-materiais', 'eventos-materiais', false);

-- Políticas de storage para campanhas-pecas (INSERT)
DROP POLICY IF EXISTS "Upload campanhas autorizado" ON storage.objects;
CREATE POLICY "Upload campanhas autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campanhas-pecas' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'gestor_captacao'::app_role))
  );

-- Políticas de storage para campanhas-pecas (SELECT)
DROP POLICY IF EXISTS "Visualizar campanhas autorizado" ON storage.objects;
CREATE POLICY "Visualizar campanhas autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campanhas-pecas' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'gestor_captacao'::app_role) OR
     has_role(auth.uid(), 'diretoria'::app_role))
  );

-- Políticas de storage para materiais-biblioteca (INSERT)
DROP POLICY IF EXISTS "Upload biblioteca autorizado" ON storage.objects;
CREATE POLICY "Upload biblioteca autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'materiais-biblioteca' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role))
  );

-- Políticas de storage para materiais-biblioteca (SELECT)
DROP POLICY IF EXISTS "Visualizar biblioteca autorizado" ON storage.objects;
CREATE POLICY "Visualizar biblioteca autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materiais-biblioteca' AND auth.uid() IS NOT NULL
  );

-- Políticas de storage para eventos-materiais (INSERT)
DROP POLICY IF EXISTS "Upload eventos autorizado" ON storage.objects;
CREATE POLICY "Upload eventos autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'eventos-materiais' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role))
  );

-- Políticas de storage para eventos-materiais (SELECT)
DROP POLICY IF EXISTS "Visualizar eventos autorizado" ON storage.objects;
CREATE POLICY "Visualizar eventos autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'eventos-materiais' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'diretoria'::app_role))
  );

-- Triggers para updated_at
DROP TRIGGER IF EXISTS "update_campanhas_updated_at" ON public.campanhas;
CREATE TRIGGER update_campanhas_updated_at
  BEFORE UPDATE ON public.campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_conteudos_updated_at" ON public.conteudos;
CREATE TRIGGER update_conteudos_updated_at
  BEFORE UPDATE ON public.conteudos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_marketing_leads_updated_at" ON public.marketing_leads;
CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_materiais_biblioteca_updated_at" ON public.materiais_biblioteca;
CREATE TRIGGER update_materiais_biblioteca_updated_at
  BEFORE UPDATE ON public.materiais_biblioteca
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_eventos_updated_at" ON public.eventos;
CREATE TRIGGER update_eventos_updated_at
  BEFORE UPDATE ON public.eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_parceiros_updated_at" ON public.parceiros;
CREATE TRIGGER update_parceiros_updated_at
  BEFORE UPDATE ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_automacoes_config_updated_at" ON public.automacoes_config;
CREATE TRIGGER update_automacoes_config_updated_at
  BEFORE UPDATE ON public.automacoes_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251113180126_b2337471-cca5-46a4-b4ef-c93e152d9f7c.sql ===
-- Adicionar novos campos à tabela radiologia_pendencias para suportar importação Excel
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS data_exame DATE,
ADD COLUMN IF NOT EXISTS hora_exame TIME,
ADD COLUMN IF NOT EXISTS nome_paciente TEXT,
ADD COLUMN IF NOT EXISTS prioridade TEXT,
ADD COLUMN IF NOT EXISTS atribuido_a TEXT,
ADD COLUMN IF NOT EXISTS tipo_atendimento TEXT,
ADD COLUMN IF NOT EXISTS descricao_exame TEXT,
ADD COLUMN IF NOT EXISTS id_paciente TEXT,
ADD COLUMN IF NOT EXISTS numero_imagens INTEGER,
ADD COLUMN IF NOT EXISTS acesso TEXT UNIQUE, -- Campo chave para evitar duplicatas
ADD COLUMN IF NOT EXISTS modalidade TEXT,
ADD COLUMN IF NOT EXISTS ae_origem TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS medico_prescritor TEXT,
ADD COLUMN IF NOT EXISTS nota TEXT,
ADD COLUMN IF NOT EXISTS tempo_decorrido TEXT,
ADD COLUMN IF NOT EXISTS arquivo_importacao TEXT,
ADD COLUMN IF NOT EXISTS data_importacao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS importado_por UUID REFERENCES auth.users(id);

-- Criar índice no campo acesso para busca rápida
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_acesso ON public.radiologia_pendencias(acesso);

-- Criar tabela para histórico de importações
CREATE TABLE IF NOT EXISTS public.radiologia_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  arquivo_nome TEXT NOT NULL,
  total_linhas INTEGER NOT NULL,
  linhas_inseridas INTEGER NOT NULL,
  linhas_atualizadas INTEGER NOT NULL,
  linhas_erro INTEGER NOT NULL,
  erros JSONB,
  importado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela de importações
ALTER TABLE public.radiologia_importacoes ENABLE ROW LEVEL SECURITY;

-- Política RLS para importações
DROP POLICY IF EXISTS "Usuários autorizados podem ver importações" ON public.radiologia_importacoes;
CREATE POLICY "Usuários autorizados podem ver importações"
  ON public.radiologia_importacoes
  FOR SELECT
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

DROP POLICY IF EXISTS "Usuários autorizados podem criar importações" ON public.radiologia_importacoes;
CREATE POLICY "Usuários autorizados podem criar importações"
  ON public.radiologia_importacoes
  FOR INSERT
  WITH CHECK (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_radiologia_importacoes_updated_at" ON public.radiologia_importacoes;
CREATE TRIGGER update_radiologia_importacoes_updated_at
  BEFORE UPDATE ON public.radiologia_importacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251113190918_868c92b1-0a14-4c6d-985a-941059f29690.sql ===
-- Tornar campos opcionais para permitir importação de dados individuais de exames
ALTER TABLE radiologia_pendencias 
  ALTER COLUMN cliente_id DROP NOT NULL,
  ALTER COLUMN medico_id DROP NOT NULL,
  ALTER COLUMN segmento DROP NOT NULL,
  ALTER COLUMN data_referencia DROP NOT NULL,
  ALTER COLUMN quantidade_pendente DROP NOT NULL;

-- === 20251114144354_55d502ef-a122-4257-8372-366e50a49d97.sql ===
-- Adicionar o role 'externos' ao enum app_role
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'externos';

-- === 20251114144432_250ee486-17af-4787-b73e-a7c83190dae3.sql ===
-- Adicionar permissões para o perfil externos
INSERT INTO public.permissoes (modulo, acao, perfil, ativo)
VALUES 
  ('suporte', 'visualizar', 'externos', true),
  ('suporte', 'criar', 'externos', true)
ON CONFLICT DO NOTHING;

-- === 20251114165332_9d3db261-63b8-4a38-b1e4-6f2947717a62.sql ===
-- Adicionar novo tipo de documento "Link Externo"
    ALTER TYPE tipo_documento_medico ADD VALUE IF NOT EXISTS 'link_externo';
