
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
DO $altc$ BEGIN ALTER TABLE radiologia_pendencias 
  ALTER COLUMN cliente_id DROP NOT NULL,
  ALTER COLUMN medico_id DROP NOT NULL,
  ALTER COLUMN segmento DROP NOT NULL,
  ALTER COLUMN data_referencia DROP NOT NULL,
  ALTER COLUMN quantidade_pendente DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- === 20251114144354_55d502ef-a122-4257-8372-366e50a49d97.sql ===
-- Adicionar o role 'externos' ao enum app_role
DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'externos'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251114144432_250ee486-17af-4787-b73e-a7c83190dae3.sql ===
-- Adicionar permissões para o perfil externos
INSERT INTO public.permissoes (modulo, acao, perfil, ativo)
VALUES 
  ('suporte', 'visualizar', 'externos', true),
  ('suporte', 'criar', 'externos', true)
ON CONFLICT DO NOTHING;

-- === 20251114165332_9d3db261-63b8-4a38-b1e4-6f2947717a62.sql ===
-- Adicionar novo tipo de documento "Link Externo"
DO $aw$ BEGIN ALTER TYPE tipo_documento_medico ADD VALUE IF NOT EXISTS 'link_externo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- Adicionar campo para URL externa na tabela medico_documentos
ALTER TABLE medico_documentos ADD COLUMN IF NOT EXISTS url_externa TEXT;

-- Adicionar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_medico_documentos_url_externa ON medico_documentos(url_externa) WHERE url_externa IS NOT NULL;

-- === 20251114170446_de815008-3144-4f2b-82bf-9ba9186edd41.sql ===
-- Fix search_path for functions that don't have it set
-- This addresses the Supabase linter warning about mutable search paths

-- Fix calculate_data_termino function
CREATE OR REPLACE FUNCTION public.calculate_data_termino()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.data_inicio IS NOT NULL AND NEW.prazo_meses IS NOT NULL THEN
    NEW.data_termino := (NEW.data_inicio + (NEW.prazo_meses || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix create_disparo_task_on_licitacao_won function
CREATE OR REPLACE FUNCTION public.create_disparo_task_on_licitacao_won()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    INSERT INTO worklist_tarefas (
      modulo,
      titulo,
      descricao,
      status,
      data_limite,
      licitacao_id,
      created_by
    ) VALUES (
      'disparos',
      'Iniciar captação pós-licitação',
      'Licitação arrematada: ' || NEW.numero_edital || ' - ' || NEW.objeto,
      'nova_oportunidade',
      CURRENT_DATE + INTERVAL '2 days',
      NEW.id,
      NEW.responsavel_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix set_ticket_numero function
CREATE OR REPLACE FUNCTION public.set_ticket_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.generate_ticket_numero();
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix update_conversas_updated_at function
CREATE OR REPLACE FUNCTION public.update_conversas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- === 20251114171852_221869ed-5b09-4691-bbea-c8144a5336ef.sql ===
-- Fix RLS policy for comunicacao_participantes to allow participants to add others
-- Currently only channel creators can add participants, which is too restrictive

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Channel creators can add participants" ON comunicacao_participantes;

-- Create new policy that allows:
-- 1. Channel creators to add participants
-- 2. Existing channel participants to add new participants
DROP POLICY IF EXISTS "Channel creators and participants can add participants" ON comunicacao_participantes;
CREATE POLICY "Channel creators and participants can add participants"
ON comunicacao_participantes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM comunicacao_canais
    WHERE comunicacao_canais.id = comunicacao_participantes.canal_id
    AND comunicacao_canais.criado_por = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM comunicacao_participantes existing_participant
    WHERE existing_participant.canal_id = comunicacao_participantes.canal_id
    AND existing_participant.user_id = auth.uid()
  )
);

-- === 20251114173220_aa3b34f0-e04b-4738-b6d7-51785bb3c984.sql ===
-- Enable RLS on profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them properly
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Allow all authenticated users to view all profiles (needed for selecting participants)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- === 20251114173315_2489ac6f-36b4-4132-af90-d15aceb588bf.sql ===
-- Enable RLS on profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them properly
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Allow all authenticated users to view all profiles (needed for selecting participants)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- === 20251114173353_b61b3a78-c576-47e0-aca8-1365dd1fa124.sql ===
-- Enable RLS on profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them properly
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Allow all authenticated users to view all profiles (needed for selecting participants)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- === 20251114182623_6ddefbb7-7721-45f3-b183-bf9a5d8d6fcf.sql ===
-- Adicionar configurações de status para o Kanban de Captação
INSERT INTO kanban_status_config (modulo, status_id, label, ordem, cor, ativo) VALUES
('disparos', 'enviados', 'Enviados', 1, '#3b82f6', true),
('disparos', 'respondidos', 'Respondidos', 2, '#8b5cf6', true),
('disparos', 'em_conversa', 'Em Conversa', 3, '#f59e0b', true),
('disparos', 'qualificados', 'Qualificados', 4, '#10b981', true),
('disparos', 'descartados', 'Descartados', 5, '#ef4444', true)
ON CONFLICT DO NOTHING;

-- Criar tabela para tracking de leads de captação (respostas + conversas)
CREATE TABLE IF NOT EXISTS captacao_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade TEXT,
  uf TEXT,
  email TEXT,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'enviados',
  disparo_log_id UUID REFERENCES disparos_log(id) ON DELETE SET NULL,
  disparo_programado_id UUID REFERENCES disparos_programados(id) ON DELETE SET NULL,
  email_resposta_id UUID REFERENCES email_respostas(id) ON DELETE SET NULL,
  medico_id UUID REFERENCES medicos(id) ON DELETE SET NULL,
  ultima_mensagem_enviada TEXT,
  ultima_resposta_recebida TEXT,
  data_ultimo_contato TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_captacao_leads_status ON captacao_leads(status);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_disparo_log ON captacao_leads(disparo_log_id);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_email ON captacao_leads(email);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_medico ON captacao_leads(medico_id);

-- Habilitar RLS
ALTER TABLE captacao_leads ENABLE ROW LEVEL SECURITY;

-- Política de acesso
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar captacao_leads" ON captacao_leads;
CREATE POLICY "Usuários autorizados podem gerenciar captacao_leads"
ON captacao_leads
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_captacao_leads_updated_at" ON captacao_leads;
CREATE TRIGGER update_captacao_leads_updated_at
  BEFORE UPDATE ON captacao_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Criar tabela para tracking de disparos recentes (anti-duplicação)
CREATE TABLE IF NOT EXISTS disparos_historico_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  telefone TEXT,
  ultima_campanha TEXT,
  ultimo_disparo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_email_or_phone UNIQUE NULLS NOT DISTINCT (email, telefone)
);

CREATE INDEX IF NOT EXISTS idx_disparos_historico_email ON disparos_historico_contatos(email);
CREATE INDEX IF NOT EXISTS idx_disparos_historico_telefone ON disparos_historico_contatos(telefone);
CREATE INDEX IF NOT EXISTS idx_disparos_historico_ultimo ON disparos_historico_contatos(ultimo_disparo);

-- RLS para historico de contatos
ALTER TABLE disparos_historico_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar historico" ON disparos_historico_contatos;
CREATE POLICY "Usuários autorizados podem gerenciar historico"
ON disparos_historico_contatos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- === 20251117140544_ecbbb402-c467-4efd-922c-646462e98351.sql ===
-- Remover políticas antigas se existirem e criar novas
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar medicos" ON public.medicos;
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;

-- Adicionar política para gestor_radiologia visualizar médicos
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar medicos" ON public.medicos;
CREATE POLICY "Gestores de radiologia podem visualizar medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
  has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- Adicionar política para gestor_radiologia visualizar clientes
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;
CREATE POLICY "Gestores de radiologia podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- === 20251117141047_e21b91ed-3e36-4537-9b59-e91b9fb36351.sql ===
-- Adicionar permissões faltantes para gestores de radiologia

-- radiologia_importacoes: adicionar UPDATE e DELETE
DROP POLICY IF EXISTS "Usuários autorizados podem atualizar importações" ON public.radiologia_importacoes;
CREATE POLICY "Usuários autorizados podem atualizar importações"
ON public.radiologia_importacoes
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem deletar importações" ON public.radiologia_importacoes;
CREATE POLICY "Usuários autorizados podem deletar importações"
ON public.radiologia_importacoes
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- radiologia_pendencias_comentarios: adicionar DELETE para gestores
DROP POLICY IF EXISTS "Gestores podem deletar comentarios" ON public.radiologia_pendencias_comentarios;
CREATE POLICY "Gestores podem deletar comentarios"
ON public.radiologia_pendencias_comentarios
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias_comentarios: permitir UPDATE completo para gestores
DROP POLICY IF EXISTS "Users can update own comentarios" ON public.radiologia_pendencias_comentarios;

DROP POLICY IF EXISTS "Gestores podem atualizar comentarios" ON public.radiologia_pendencias_comentarios;
CREATE POLICY "Gestores podem atualizar comentarios"
ON public.radiologia_pendencias_comentarios
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias_historico: adicionar UPDATE e DELETE
DROP POLICY IF EXISTS "Gestores podem atualizar historico" ON public.radiologia_pendencias_historico;
CREATE POLICY "Gestores podem atualizar historico"
ON public.radiologia_pendencias_historico
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

DROP POLICY IF EXISTS "Gestores podem deletar historico" ON public.radiologia_pendencias_historico;
CREATE POLICY "Gestores podem deletar historico"
ON public.radiologia_pendencias_historico
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- === 20251117141516_abde5cdf-dae3-42f5-80e5-cda47babd96c.sql ===
-- Atualizar bucket contratos-documentos para aceitar mais tipos de arquivo
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed'
]
WHERE id = 'contratos-documentos';

-- === 20251117142254_a2e5c5a1-f9f7-4a60-b4b9-03b4c39067c5.sql ===
-- Adicionar campo para customização de dias de aviso de vencimento
DO $acol$ BEGIN ALTER TABLE public.contratos 
ADD COLUMN dias_aviso_vencimento integer DEFAULT 60 CHECK (dias_aviso_vencimento >= 30 AND dias_aviso_vencimento <= 60); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

COMMENT ON COLUMN public.contratos.dias_aviso_vencimento IS 'Número de dias antes do vencimento para começar a exibir alertas (entre 30 e 60 dias)';

-- === 20251117144230_6b984197-6bf6-4022-b660-6dc2265d64eb.sql ===
-- Adicionar campo para rastrear última visualização do ticket pelo admin
DO $acol$ BEGIN ALTER TABLE public.suporte_tickets 
ADD COLUMN ultima_visualizacao_admin timestamp with time zone; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

COMMENT ON COLUMN public.suporte_tickets.ultima_visualizacao_admin IS 'Última vez que um admin visualizou este ticket (para controlar notificações de novas respostas)';

-- === 20251117145618_2543ce20-896a-4a6f-8597-bdd73a3ffaaa.sql ===
-- Adicionar campo anexos na tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios
ADD COLUMN IF NOT EXISTS anexos TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.suporte_comentarios.anexos IS 'Caminhos dos arquivos anexados ao comentário';

-- === 20251117164049_09370064-163f-451b-8acc-70d5b91ef049.sql ===
-- Add missing UPDATE and DELETE policies for contrato_anexos table
DROP POLICY IF EXISTS "Authorized users can update contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can update contrato_anexos"
ON public.contrato_anexos
FOR UPDATE
TO public
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "Authorized users can delete contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can delete contrato_anexos"
ON public.contrato_anexos
FOR DELETE
TO public
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- === 20251119175007_8d54b4af-822e-4d94-bf72-3d866a8c0524.sql ===
-- Adicionar campos para rastrear envio de emails na tabela suporte_tickets
DO $acol$ BEGIN ALTER TABLE public.suporte_tickets
ADD COLUMN email_enviado_em timestamp with time zone,
ADD COLUMN email_status text DEFAULT 'pendente' CHECK (email_status IN ('pendente', 'enviado', 'falha')),
ADD COLUMN email_erro text; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- === 20251121165234_587425d6-2b91-4ddb-82fe-c14f4832e01f.sql ===
-- Adicionar 'lideres' ao enum app_role
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'lideres'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251121165258_ee0e283d-ce22-4dea-9106-6d4ecfd4c087.sql ===
-- Função para verificar se usuário é líder de um setor específico
CREATE OR REPLACE FUNCTION public.is_setor_leader(_user_id uuid, _setor_id uuid)
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
    WHERE ur.user_id = _user_id
      AND ur.role = 'lideres'
      AND p.setor_id = _setor_id
  )
$$;

-- Função para obter o setor_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_setor(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT setor_id FROM public.profiles WHERE id = _user_id
$$;

-- Função para verificar se usuário é líder (qualquer setor)
CREATE OR REPLACE FUNCTION public.is_leader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'lideres')
$$;

-- === 20251121172827_b1f9d33c-882c-4a76-b7f3-1964806f0b8b.sql ===
-- Criar tabela central de auditoria
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Quem realizou a ação
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  usuario_perfil TEXT,
  
  -- Onde e o quê foi feito
  modulo TEXT NOT NULL, -- contratos, medicos, licitacoes, etc
  tabela TEXT NOT NULL, -- nome da tabela afetada
  acao TEXT NOT NULL, -- INSERT, UPDATE, DELETE, VIEW, EXPORT, APPROVE, etc
  
  -- Contexto da ação
  registro_id TEXT, -- ID do registro afetado
  registro_descricao TEXT, -- descrição legível do registro
  
  -- Dados da alteração
  dados_antigos JSONB, -- valores antes da mudança
  dados_novos JSONB, -- valores após a mudança
  campos_alterados TEXT[], -- lista de campos modificados
  
  -- Controle e segurança
  autorizado BOOLEAN DEFAULT true,
  motivo_bloqueio TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Informações adicionais
  detalhes TEXT,
  metadata JSONB
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_created_at ON public.auditoria_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_usuario_id ON public.auditoria_logs(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_modulo ON public.auditoria_logs(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_tabela ON public.auditoria_logs(tabela);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_acao ON public.auditoria_logs(acao);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_registro_id ON public.auditoria_logs(registro_id);

-- Habilitar RLS
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Admins podem visualizar todos os logs" ON public.auditoria_logs;
CREATE POLICY "Admins podem visualizar todos os logs"
ON public.auditoria_logs
FOR SELECT
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.auditoria_logs;
CREATE POLICY "Sistema pode inserir logs"
ON public.auditoria_logs
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários podem ver seus próprios logs" ON public.auditoria_logs;
CREATE POLICY "Usuários podem ver seus próprios logs"
ON public.auditoria_logs
FOR SELECT
USING (auth.uid() = usuario_id);

-- Função para registrar log de auditoria
CREATE OR REPLACE FUNCTION public.log_auditoria(
  p_modulo TEXT,
  p_tabela TEXT,
  p_acao TEXT,
  p_registro_id TEXT DEFAULT NULL,
  p_registro_descricao TEXT DEFAULT NULL,
  p_dados_antigos JSONB DEFAULT NULL,
  p_dados_novos JSONB DEFAULT NULL,
  p_campos_alterados TEXT[] DEFAULT NULL,
  p_detalhes TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL,
  p_usuario_nome TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
  v_user_nome TEXT;
  v_user_perfil TEXT;
BEGIN
  -- Obter informações do usuário
  v_user_id := COALESCE(p_usuario_id, auth.uid());
  
  IF v_user_id IS NOT NULL THEN
    SELECT nome_completo INTO v_user_nome
    FROM profiles
    WHERE id = v_user_id;
    
    SELECT string_agg(role::text, ', ') INTO v_user_perfil
    FROM user_roles
    WHERE user_id = v_user_id;
  END IF;
  
  v_user_nome := COALESCE(p_usuario_nome, v_user_nome, 'Sistema');
  
  -- Inserir log
  INSERT INTO auditoria_logs (
    usuario_id,
    usuario_nome,
    usuario_perfil,
    modulo,
    tabela,
    acao,
    registro_id,
    registro_descricao,
    dados_antigos,
    dados_novos,
    campos_alterados,
    detalhes
  ) VALUES (
    v_user_id,
    v_user_nome,
    v_user_perfil,
    p_modulo,
    p_tabela,
    p_acao,
    p_registro_id,
    p_registro_descricao,
    p_dados_antigos,
    p_dados_novos,
    p_campos_alterados,
    p_detalhes
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Função trigger genérica para auditoria
CREATE OR REPLACE FUNCTION public.trigger_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modulo TEXT;
  v_campos_alterados TEXT[];
  v_key TEXT;
BEGIN
  -- Determinar módulo baseado na tabela
  v_modulo := CASE TG_TABLE_NAME
    WHEN 'contratos' THEN 'Contratos'
    WHEN 'contrato_itens' THEN 'Contratos'
    WHEN 'contrato_renovacoes' THEN 'Contratos'
    WHEN 'contratos_medico' THEN 'Contratos'
    WHEN 'medicos' THEN 'Médicos'
    WHEN 'medico_vinculo_unidade' THEN 'Médicos'
    WHEN 'clientes' THEN 'Clientes'
    WHEN 'unidades' THEN 'Clientes'
    WHEN 'licitacoes' THEN 'Licitações'
    WHEN 'disparos_log' THEN 'Disparos'
    WHEN 'disparos_programados' THEN 'Disparos'
    WHEN 'campanhas' THEN 'Marketing'
    WHEN 'marketing_leads' THEN 'Marketing'
    WHEN 'suporte_tickets' THEN 'Suporte'
    WHEN 'patrimonio' THEN 'Patrimônio'
    WHEN 'escalas' THEN 'Escalas'
    WHEN 'profiles' THEN 'Configurações'
    WHEN 'user_roles' THEN 'Configurações'
    WHEN 'permissoes' THEN 'Configurações'
    ELSE 'Sistema'
  END;
  
  IF TG_OP = 'INSERT' THEN
    PERFORM log_auditoria(
      v_modulo,
      TG_TABLE_NAME,
      'INSERT',
      NEW.id::text,
      NULL,
      NULL,
      to_jsonb(NEW),
      NULL,
      'Registro criado'
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Identificar campos alterados
    FOR v_key IN SELECT jsonb_object_keys(to_jsonb(NEW))
    LOOP
      IF to_jsonb(OLD) ->> v_key IS DISTINCT FROM to_jsonb(NEW) ->> v_key THEN
        v_campos_alterados := array_append(v_campos_alterados, v_key);
      END IF;
    END LOOP;
    
    IF array_length(v_campos_alterados, 1) > 0 THEN
      PERFORM log_auditoria(
        v_modulo,
        TG_TABLE_NAME,
        'UPDATE',
        NEW.id::text,
        NULL,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_campos_alterados,
        'Registro atualizado'
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_auditoria(
      v_modulo,
      TG_TABLE_NAME,
      'DELETE',
      OLD.id::text,
      NULL,
      to_jsonb(OLD),
      NULL,
      NULL,
      'Registro excluído'
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Criar triggers para as principais tabelas

-- CONTRATOS
DROP TRIGGER IF EXISTS audit_contratos ON contratos;
DROP TRIGGER IF EXISTS "audit_contratos" ON contratos;
CREATE TRIGGER audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contrato_itens ON contrato_itens;
DROP TRIGGER IF EXISTS "audit_contrato_itens" ON contrato_itens;
CREATE TRIGGER audit_contrato_itens
  AFTER INSERT OR UPDATE OR DELETE ON contrato_itens
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contrato_renovacoes ON contrato_renovacoes;
DROP TRIGGER IF EXISTS "audit_contrato_renovacoes" ON contrato_renovacoes;
CREATE TRIGGER audit_contrato_renovacoes
  AFTER INSERT OR UPDATE OR DELETE ON contrato_renovacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contratos_medico ON contratos_medico;
DROP TRIGGER IF EXISTS "audit_contratos_medico" ON contratos_medico;
CREATE TRIGGER audit_contratos_medico
  AFTER INSERT OR UPDATE OR DELETE ON contratos_medico
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- MÉDICOS
DROP TRIGGER IF EXISTS audit_medicos ON medicos;
DROP TRIGGER IF EXISTS "audit_medicos" ON medicos;
CREATE TRIGGER audit_medicos
  AFTER INSERT OR UPDATE OR DELETE ON medicos
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_medico_vinculo_unidade ON medico_vinculo_unidade;
DROP TRIGGER IF EXISTS "audit_medico_vinculo_unidade" ON medico_vinculo_unidade;
CREATE TRIGGER audit_medico_vinculo_unidade
  AFTER INSERT OR UPDATE OR DELETE ON medico_vinculo_unidade
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- CLIENTES
DROP TRIGGER IF EXISTS audit_clientes ON clientes;
DROP TRIGGER IF EXISTS "audit_clientes" ON clientes;
CREATE TRIGGER audit_clientes
  AFTER INSERT OR UPDATE OR DELETE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_unidades ON unidades;
DROP TRIGGER IF EXISTS "audit_unidades" ON unidades;
CREATE TRIGGER audit_unidades
  AFTER INSERT OR UPDATE OR DELETE ON unidades
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- LICITAÇÕES
DROP TRIGGER IF EXISTS audit_licitacoes ON licitacoes;
DROP TRIGGER IF EXISTS "audit_licitacoes" ON licitacoes;
CREATE TRIGGER audit_licitacoes
  AFTER INSERT OR UPDATE OR DELETE ON licitacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- DISPAROS
DROP TRIGGER IF EXISTS audit_disparos_log ON disparos_log;
DROP TRIGGER IF EXISTS "audit_disparos_log" ON disparos_log;
CREATE TRIGGER audit_disparos_log
  AFTER INSERT OR UPDATE OR DELETE ON disparos_log
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_disparos_programados ON disparos_programados;
DROP TRIGGER IF EXISTS "audit_disparos_programados" ON disparos_programados;
CREATE TRIGGER audit_disparos_programados
  AFTER INSERT OR UPDATE OR DELETE ON disparos_programados
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- MARKETING
DROP TRIGGER IF EXISTS audit_campanhas ON campanhas;
DROP TRIGGER IF EXISTS "audit_campanhas" ON campanhas;
CREATE TRIGGER audit_campanhas
  AFTER INSERT OR UPDATE OR DELETE ON campanhas
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_marketing_leads ON marketing_leads;
DROP TRIGGER IF EXISTS "audit_marketing_leads" ON marketing_leads;
CREATE TRIGGER audit_marketing_leads
  AFTER INSERT OR UPDATE OR DELETE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- SUPORTE
DROP TRIGGER IF EXISTS audit_suporte_tickets ON suporte_tickets;
DROP TRIGGER IF EXISTS "audit_suporte_tickets" ON suporte_tickets;
CREATE TRIGGER audit_suporte_tickets
  AFTER INSERT OR UPDATE OR DELETE ON suporte_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- PATRIMÔNIO
DROP TRIGGER IF EXISTS audit_patrimonio ON patrimonio;
DROP TRIGGER IF EXISTS "audit_patrimonio" ON patrimonio;
CREATE TRIGGER audit_patrimonio
  AFTER INSERT OR UPDATE OR DELETE ON patrimonio
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- ESCALAS
DROP TRIGGER IF EXISTS audit_escalas ON escalas;
DROP TRIGGER IF EXISTS "audit_escalas" ON escalas;
CREATE TRIGGER audit_escalas
  AFTER INSERT OR UPDATE OR DELETE ON escalas
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- CONFIGURAÇÕES
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
DROP TRIGGER IF EXISTS "audit_profiles" ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_user_roles ON user_roles;
DROP TRIGGER IF EXISTS "audit_user_roles" ON user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_permissoes ON permissoes;
DROP TRIGGER IF EXISTS "audit_permissoes" ON permissoes;
CREATE TRIGGER audit_permissoes
  AFTER INSERT OR UPDATE OR DELETE ON permissoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- === 20251121184242_d75612d2-816e-46b6-8908-cec85c0beb7e.sql ===
-- Adicionar campo para múltiplos turnos nas escalas
DO $acol$ BEGIN ALTER TABLE radiologia_agendas_escalas 
ADD COLUMN turnos JSONB DEFAULT '[]'::jsonb; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Comentário explicativo
COMMENT ON COLUMN radiologia_agendas_escalas.turnos IS 'Array de turnos diários no formato: [{"inicio": "07:00", "fim": "12:00"}, ...]';

-- === 20251121193706_37652016-8863-4f27-a5ee-511271bc664d.sql ===
-- Adicionar coluna observacoes na tabela radiologia_agendas_escalas
DO $acol$ BEGIN ALTER TABLE radiologia_agendas_escalas
ADD COLUMN observacoes text; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- === 20251121195212_058b5947-c634-4034-b2a3-5b0e3c2fecf6.sql ===

-- Políticas RLS para suporte_tickets

-- Usuários podem ver seus próprios tickets
DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios tickets" ON public.suporte_tickets;
CREATE POLICY "Usuários podem visualizar seus próprios tickets"
ON public.suporte_tickets
FOR SELECT
TO authenticated
USING (auth.uid() = solicitante_id);

-- Admins e líderes podem ver todos os tickets
DROP POLICY IF EXISTS "Admins e líderes podem visualizar todos os tickets" ON public.suporte_tickets;
CREATE POLICY "Admins e líderes podem visualizar todos os tickets"
ON public.suporte_tickets
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
);

-- Usuários podem criar seus próprios tickets
DROP POLICY IF EXISTS "Usuários podem criar tickets" ON public.suporte_tickets;
CREATE POLICY "Usuários podem criar tickets"
ON public.suporte_tickets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = solicitante_id);

-- Usuários podem atualizar seus próprios tickets
DROP POLICY IF EXISTS "Usuários podem atualizar seus tickets" ON public.suporte_tickets;
CREATE POLICY "Usuários podem atualizar seus tickets"
ON public.suporte_tickets
FOR UPDATE
TO authenticated
USING (auth.uid() = solicitante_id)
WITH CHECK (auth.uid() = solicitante_id);

-- Admins e líderes podem atualizar qualquer ticket
DROP POLICY IF EXISTS "Admins e líderes podem atualizar todos os tickets" ON public.suporte_tickets;
CREATE POLICY "Admins e líderes podem atualizar todos os tickets"
ON public.suporte_tickets
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
)
WITH CHECK (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
);

-- Admins podem deletar tickets
DROP POLICY IF EXISTS "Admins podem deletar tickets" ON public.suporte_tickets;
CREATE POLICY "Admins podem deletar tickets"
ON public.suporte_tickets
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));


-- === 20251124143550_9037777c-9ab4-44c8-bdf3-dedac616774f.sql ===
-- Criar tabela para aditivos de tempo de contratos
CREATE TABLE IF NOT EXISTS public.contrato_aditivos_tempo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  data_termino DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.contrato_aditivos_tempo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mesmas do contrato pai)
DROP POLICY IF EXISTS "Usuários autenticados podem ver aditivos" ON public.contrato_aditivos_tempo;
CREATE POLICY "Usuários autenticados podem ver aditivos" 
ON public.contrato_aditivos_tempo 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem criar aditivos" ON public.contrato_aditivos_tempo;
CREATE POLICY "Usuários autenticados podem criar aditivos" 
ON public.contrato_aditivos_tempo 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar aditivos" ON public.contrato_aditivos_tempo;
CREATE POLICY "Usuários autenticados podem atualizar aditivos" 
ON public.contrato_aditivos_tempo 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem deletar aditivos" ON public.contrato_aditivos_tempo;
CREATE POLICY "Usuários autenticados podem deletar aditivos" 
ON public.contrato_aditivos_tempo 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS "update_contrato_aditivos_tempo_updated_at" ON public.contrato_aditivos_tempo;
CREATE TRIGGER update_contrato_aditivos_tempo_updated_at
  BEFORE UPDATE ON public.contrato_aditivos_tempo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.contrato_aditivos_tempo IS 'Aditivos de tempo para extensão de prazos contratuais';
COMMENT ON COLUMN public.contrato_aditivos_tempo.contrato_id IS 'Referência ao contrato principal';
COMMENT ON COLUMN public.contrato_aditivos_tempo.data_inicio IS 'Data de início do período do aditivo';
COMMENT ON COLUMN public.contrato_aditivos_tempo.prazo_meses IS 'Prazo em meses do aditivo';
COMMENT ON COLUMN public.contrato_aditivos_tempo.data_termino IS 'Data de término calculada do aditivo';

-- === 20251124181756_b3652795-5546-4c7e-a389-49d51fad0a9e.sql ===
-- Adicionar campos para rastrear quem resolveu o ticket
ALTER TABLE public.suporte_tickets
ADD COLUMN IF NOT EXISTS resolvido_por_id UUID,
ADD COLUMN IF NOT EXISTS resolvido_por_nome TEXT;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.suporte_tickets.resolvido_por_id IS 'ID do usuário da equipe de suporte que resolveu o ticket';
COMMENT ON COLUMN public.suporte_tickets.resolvido_por_nome IS 'Nome do usuário da equipe de suporte que resolveu o ticket';

-- === 20251127175823_bd6dca51-b1a8-41c4-94a9-f616803e9b76.sql ===
-- Add new value to tipo_documento_medico enum
DO $aw$ BEGIN ALTER TYPE public.tipo_documento_medico ADD VALUE IF NOT EXISTS 'contrato_aditivo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;


-- === 20251127195420_c4493478-6d82-4754-94f1-f5c9c9a4b654.sql ===
-- Add new columns to campanhas table for enhanced functionality
ALTER TABLE public.campanhas 
ADD COLUMN IF NOT EXISTS descricao TEXT,
ADD COLUMN IF NOT EXISTS mensagem TEXT,
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_html TEXT,
ADD COLUMN IF NOT EXISTS variaveis_dinamicas TEXT[],
ADD COLUMN IF NOT EXISTS agendamento_tipo TEXT DEFAULT 'imediato',
ADD COLUMN IF NOT EXISTS data_agendamento TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS horario_inteligente BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tamanho_lote INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS segmento_id UUID,
ADD COLUMN IF NOT EXISTS arquivo_csv_url TEXT,
ADD COLUMN IF NOT EXISTS total_enviados INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_entregues INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_aberturas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cliques INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_respostas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_conversoes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS custo_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id);

-- Create segmentos table for saved audience segments
CREATE TABLE IF NOT EXISTS public.segmentos_publico (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    filtros JSONB NOT NULL DEFAULT '{}',
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create campaign envios log table
CREATE TABLE IF NOT EXISTS public.campanhas_envios (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
    destinatario_id UUID,
    destinatario_nome TEXT,
    destinatario_email TEXT,
    destinatario_telefone TEXT,
    status TEXT DEFAULT 'pendente',
    motivo_falha TEXT,
    data_envio TIMESTAMP WITH TIME ZONE,
    data_abertura TIMESTAMP WITH TIME ZONE,
    data_clique TIMESTAMP WITH TIME ZONE,
    data_resposta TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.segmentos_publico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas_envios ENABLE ROW LEVEL SECURITY;

-- RLS policies for segmentos_publico
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar segmentos" ON public.segmentos_publico;
CREATE POLICY "Usuários autorizados podem gerenciar segmentos" ON public.segmentos_publico
FOR ALL USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- RLS policies for campanhas_envios
DROP POLICY IF EXISTS "Usuários autorizados podem visualizar envios" ON public.campanhas_envios;
CREATE POLICY "Usuários autorizados podem visualizar envios" ON public.campanhas_envios
FOR SELECT USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar envios" ON public.campanhas_envios;
CREATE POLICY "Usuários autorizados podem gerenciar envios" ON public.campanhas_envios
FOR ALL USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campanhas_envios_campanha ON public.campanhas_envios(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_envios_status ON public.campanhas_envios(status);
CREATE INDEX IF NOT EXISTS idx_campanhas_status ON public.campanhas(status);

-- === 20251203165954_272dc3a3-98c4-44ee-87d5-46c4ec29a053.sql ===
-- Enable realtime for licitacoes table
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacoes;

-- === 20251203175624_b1b51e67-5f67-4419-baf9-66fcd1159135.sql ===
-- Add Evolution API fields to chips table
ALTER TABLE public.chips 
ADD COLUMN IF NOT EXISTS instance_id text,
ADD COLUMN IF NOT EXISTS instance_name text,
ADD COLUMN IF NOT EXISTS connection_state text DEFAULT 'close',
ADD COLUMN IF NOT EXISTS profile_name text,
ADD COLUMN IF NOT EXISTS profile_picture_url text,
ADD COLUMN IF NOT EXISTS webhook_url text,
ADD COLUMN IF NOT EXISTS engine text DEFAULT 'baileys',
ADD COLUMN IF NOT EXISTS behavior_config jsonb DEFAULT '{"rejectCall": false, "ignoreGroups": false, "alwaysOnline": false, "readMessages": false, "syncFullHistory": false}'::jsonb,
ADD COLUMN IF NOT EXISTS proxy_config jsonb,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create index for instance_id
CREATE INDEX IF NOT EXISTS idx_chips_instance_id ON public.chips(instance_id);

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_chips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_chips_updated_at ON public.chips;
DROP TRIGGER IF EXISTS "update_chips_updated_at" ON public.chips;
CREATE TRIGGER update_chips_updated_at
  BEFORE UPDATE ON public.chips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chips_updated_at();

-- === 20251203180538_49303e3a-e94b-41eb-a3b2-82d0da52bf9e.sql ===
-- Create instance_proxy_settings table
CREATE TABLE IF NOT EXISTS public.instance_proxy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  host text,
  port integer,
  protocol text DEFAULT 'http',
  username text,
  password text,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(instance_id)
);

-- Enable RLS
ALTER TABLE public.instance_proxy_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Admins can manage proxy settings" ON public.instance_proxy_settings;
CREATE POLICY "Admins can manage proxy settings"
ON public.instance_proxy_settings
FOR ALL
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Gestores can view proxy settings" ON public.instance_proxy_settings;
CREATE POLICY "Gestores can view proxy settings"
ON public.instance_proxy_settings
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS "update_instance_proxy_settings_updated_at" ON public.instance_proxy_settings;
CREATE TRIGGER update_instance_proxy_settings_updated_at
  BEFORE UPDATE ON public.instance_proxy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251204124943_e6324dc1-cf9a-46a2-b184-080765327dfe.sql ===
-- Drop existing tables if they exist (from partial migration)
DROP TABLE IF EXISTS public.proposta CASCADE;
DROP TABLE IF EXISTS public.servico CASCADE;
DROP TABLE IF EXISTS public.contrato_capitacao CASCADE;

-- Create contrato_capitacao table
CREATE TABLE IF NOT EXISTS public.contrato_capitacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  setor TEXT NOT NULL DEFAULT 'captacao',
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create servico table
CREATE TABLE IF NOT EXISTS public.servico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_capitacao_id UUID NOT NULL REFERENCES public.contrato_capitacao(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create proposta table (using TEXT for status instead of enum)
CREATE TABLE IF NOT EXISTS public.proposta (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  servico_id UUID NOT NULL REFERENCES public.servico(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  valor NUMERIC,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada')),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contrato_capitacao_contrato_id ON public.contrato_capitacao(contrato_id);
CREATE INDEX IF NOT EXISTS idx_servico_contrato_capitacao_id ON public.servico(contrato_capitacao_id);
CREATE INDEX IF NOT EXISTS idx_proposta_servico_id ON public.proposta(servico_id);
CREATE INDEX IF NOT EXISTS idx_proposta_lead_id ON public.proposta(lead_id);

-- Enable RLS
ALTER TABLE public.contrato_capitacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposta ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contrato_capitacao
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar contrato_capitacao" ON public.contrato_capitacao;
CREATE POLICY "Usuários autorizados podem gerenciar contrato_capitacao"
ON public.contrato_capitacao FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contrato_capitacao" ON public.contrato_capitacao;
CREATE POLICY "Usuários autenticados podem visualizar contrato_capitacao"
ON public.contrato_capitacao FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for servico
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar servico" ON public.servico;
CREATE POLICY "Usuários autorizados podem gerenciar servico"
ON public.servico FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar servico" ON public.servico;
CREATE POLICY "Usuários autenticados podem visualizar servico"
ON public.servico FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS Policies for proposta
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar proposta" ON public.proposta;
CREATE POLICY "Usuários autorizados podem gerenciar proposta"
ON public.proposta FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar proposta" ON public.proposta;
CREATE POLICY "Usuários autenticados podem visualizar proposta"
ON public.proposta FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS "update_contrato_capitacao_updated_at" ON public.contrato_capitacao;
CREATE TRIGGER update_contrato_capitacao_updated_at
  BEFORE UPDATE ON public.contrato_capitacao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();