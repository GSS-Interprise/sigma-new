DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users or admins can update profiles" ON public.profiles;

-- Create a single consolidated UPDATE policy
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy"
ON public.profiles
FOR UPDATE
USING (
  -- User can update their own profile
  auth.uid() = id
  -- OR admin can update any profile
  OR is_admin(auth.uid())
  -- OR gestor_captacao can update any profile (for adding captadores)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  -- OR captação leader can update any profile (for adding captadores)
  OR is_captacao_leader(auth.uid())
)
WITH CHECK (
  auth.uid() = id
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
);

-- === 20260127182444_d4868a95-a4b3-4092-b1e1-f1442e6cd592.sql ===
-- Drop existing policies for comunicacao tables
DROP POLICY IF EXISTS "Participantes podem ver canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Usuários autenticados podem criar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem atualizar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem deletar canais" ON public.comunicacao_canais;

DROP POLICY IF EXISTS "Participantes podem ver mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Participantes podem enviar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem editar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem deletar mensagens" ON public.comunicacao_mensagens;

DROP POLICY IF EXISTS "Usuários podem ver participantes" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem ser adicionados" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem sair" ON public.comunicacao_participantes;

DROP POLICY IF EXISTS "Usuários podem ver notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Sistema pode criar notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Usuários podem atualizar notificações" ON public.comunicacao_notificacoes;

-- Canais: Admins veem todos, outros veem apenas onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou participantes podem ver canais"
ON public.comunicacao_canais FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), id)
);

DROP POLICY IF EXISTS "Usuários autenticados podem criar canais" ON public.comunicacao_canais;
CREATE POLICY "Usuários autenticados podem criar canais"
ON public.comunicacao_canais FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins ou criadores podem atualizar canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou criadores podem atualizar canais"
ON public.comunicacao_canais FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

DROP POLICY IF EXISTS "Admins ou criadores podem deletar canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou criadores podem deletar canais"
ON public.comunicacao_canais FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

-- Mensagens: Admins veem todas, outros veem apenas de canais onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou participantes podem ver mensagens"
ON public.comunicacao_mensagens FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou participantes podem enviar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou participantes podem enviar mensagens"
ON public.comunicacao_mensagens FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou autores podem editar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou autores podem editar mensagens"
ON public.comunicacao_mensagens FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Admins ou autores podem deletar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou autores podem deletar mensagens"
ON public.comunicacao_mensagens FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- Participantes: Admins veem todos, outros veem apenas de canais onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver participantes" ON public.comunicacao_participantes;
CREATE POLICY "Admins ou participantes podem ver participantes"
ON public.comunicacao_participantes FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou participantes podem adicionar" ON public.comunicacao_participantes;
CREATE POLICY "Admins ou participantes podem adicionar"
ON public.comunicacao_participantes FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou próprio usuário podem remover" ON public.comunicacao_participantes;
CREATE POLICY "Admins ou próprio usuário podem remover"
ON public.comunicacao_participantes FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- Notificações: Usuários veem apenas suas próprias, admins veem todas
DROP POLICY IF EXISTS "Admins ou próprio usuário podem ver notificações" ON public.comunicacao_notificacoes;
CREATE POLICY "Admins ou próprio usuário podem ver notificações"
ON public.comunicacao_notificacoes FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Sistema pode criar notificações" ON public.comunicacao_notificacoes;
CREATE POLICY "Sistema pode criar notificações"
ON public.comunicacao_notificacoes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins ou próprio usuário podem atualizar notificações" ON public.comunicacao_notificacoes;
CREATE POLICY "Admins ou próprio usuário podem atualizar notificações"
ON public.comunicacao_notificacoes FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- === 20260127182902_7815fbef-faeb-4d53-88be-4ec7c3282c87.sql ===
-- Adicionar coluna para soft delete em mensagens
DO $$ BEGIN ALTER TABLE public.comunicacao_mensagens 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_deleted_at 
ON public.comunicacao_mensagens(deleted_at);

-- Atualizar política de SELECT para filtrar mensagens excluídas
DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;

DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou participantes podem ver mensagens" 
ON public.comunicacao_mensagens FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    public.is_admin(auth.uid()) 
    OR public.is_channel_participant(auth.uid(), canal_id)
  )
);

-- Política de UPDATE para permitir soft delete
DROP POLICY IF EXISTS "Participantes podem editar suas mensagens" ON public.comunicacao_mensagens;

DROP POLICY IF EXISTS "Participantes podem editar ou deletar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Participantes podem editar ou deletar mensagens" 
ON public.comunicacao_mensagens FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR (
    public.is_channel_participant(auth.uid(), canal_id)
    AND (user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
)
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

-- Remover política de DELETE (não será mais usada)
DROP POLICY IF EXISTS "Admins ou donos podem excluir mensagens" ON public.comunicacao_mensagens;

-- === 20260127195445_448b5f26-5107-4da0-a766-0fa7f5deaccb.sql ===

-- Remover política antiga de gerenciamento
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar proposta" ON public.proposta;

-- Criar nova política que inclui usuários com permissão de contratos_servicos
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar proposta" ON public.proposta;
CREATE POLICY "Usuários autorizados podem gerenciar proposta" 
ON public.proposta 
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);


-- === 20260127200239_b9c77fb2-4c52-4d6d-91d9-9292b2f51e3a.sql ===
-- Remover política antiga de gerenciamento
DROP POLICY IF EXISTS "Gestores de contratos can manage medicos" ON public.medicos;

-- Criar nova política que inclui líderes de captação e usuários com permissão contratos_servicos
DROP POLICY IF EXISTS "Gestores de contratos can manage medicos" ON public.medicos;
CREATE POLICY "Gestores de contratos can manage medicos" 
ON public.medicos 
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);

-- === 20260128131334_e40ace5e-e40b-408b-ad80-7fa0d9dc2a95.sql ===
-- Adiciona coluna para capturar o canal de conversão do lead para médico
-- Isso permite BI sobre como os leads foram efetivamente captados/convertidos

DO $$ BEGIN ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS canal_conversao TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adiciona comentário para documentação
COMMENT ON COLUMN public.leads.canal_conversao IS 'Canal pelo qual o lead foi efetivamente convertido (WHATSAPP, EMAIL, INDICACAO, TRAFEGO-PAGO, LISTA-CAPTADORA)';

-- === 20260128141314_8b4aea86-de9a-40cb-859a-ef43218da116.sql ===
-- Expandir leitura (SELECT) de contratos para usuários de captação via permissões
-- Mantém políticas existentes e adiciona uma nova política mais abrangente.

DROP POLICY IF EXISTS "Captacao pode visualizar contratos" ON public.contratos;
CREATE POLICY "Captacao pode visualizar contratos"
ON public.contratos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);

-- Expandir leitura (SELECT) de unidades para usuários de captação via permissões
DROP POLICY IF EXISTS "Captacao pode visualizar unidades" ON public.unidades;
CREATE POLICY "Captacao pode visualizar unidades"
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
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);


-- === 20260129195103_7c9082ff-2002-4334-b974-75fc54b0bfd1.sql ===
-- ============================================
-- MÓDULO DE ESCALAS - REESTRUTURAÇÃO COMPLETA
-- Dr. Escala como fonte única da verdade (read-only)
-- ============================================

-- 1. TABELA DE LOCAIS (Hospitais) do Dr. Escala
CREATE TABLE IF NOT EXISTS public.escalas_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_externo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN DEFAULT true,
  sincronizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. TABELA DE SETORES do Dr. Escala (vinculados a locais)
CREATE TABLE IF NOT EXISTS public.escalas_setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_externo TEXT NOT NULL,
  local_id UUID NOT NULL REFERENCES public.escalas_locais(id) ON DELETE CASCADE,
  local_id_externo TEXT NOT NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  sincronizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(id_externo, local_id_externo)
);

-- 3. ATUALIZAR TABELA DE ESCALAS INTEGRADAS
-- Adicionar campos obrigatórios para local_id e setor_id
DO $$ BEGIN ALTER TABLE public.escalas_integradas 
  ADD COLUMN IF NOT EXISTS local_id_externo TEXT,
  ADD COLUMN IF NOT EXISTS setor_id_externo TEXT,
  ADD COLUMN IF NOT EXISTS local_nome TEXT,
  ADD COLUMN IF NOT EXISTS setor_nome TEXT,
  ADD COLUMN IF NOT EXISTS escala_local_id UUID REFERENCES public.escalas_locais(id),
  ADD COLUMN IF NOT EXISTS escala_setor_id UUID REFERENCES public.escalas_setores(id),
  ADD COLUMN IF NOT EXISTS dados_incompletos BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_incompleto TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 4. TABELA DE LOGS DE INCONSISTÊNCIA
CREATE TABLE IF NOT EXISTS public.escalas_inconsistencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id UUID REFERENCES public.escalas_integradas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'sem_setor', 'sem_local', 'profissional_duplicado', 'dia_sem_cobertura'
  descricao TEXT NOT NULL,
  dados_originais JSONB,
  resolvido BOOLEAN DEFAULT false,
  resolvido_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. TABELA DE ALERTAS DE ESCALAS
CREATE TABLE IF NOT EXISTS public.escalas_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL, -- 'plantao_sem_setor', 'dia_sem_cobertura', 'profissional_duplicado'
  titulo TEXT NOT NULL,
  descricao TEXT,
  local_id UUID REFERENCES public.escalas_locais(id),
  setor_id UUID REFERENCES public.escalas_setores(id),
  data_referencia DATE,
  prioridade TEXT DEFAULT 'media', -- 'baixa', 'media', 'alta', 'critica'
  lido BOOLEAN DEFAULT false,
  lido_por UUID,
  lido_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_escalas_locais_id_externo ON public.escalas_locais(id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_setores_id_externo ON public.escalas_setores(id_externo, local_id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_setores_local_id ON public.escalas_setores(local_id);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_local_setor ON public.escalas_integradas(local_id_externo, setor_id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_dados_incompletos ON public.escalas_integradas(dados_incompletos) WHERE dados_incompletos = true;
CREATE INDEX IF NOT EXISTS idx_escalas_inconsistencias_tipo ON public.escalas_inconsistencias(tipo);
CREATE INDEX IF NOT EXISTS idx_escalas_alertas_tipo ON public.escalas_alertas(tipo, lido);

-- 7. TRIGGERS PARA UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_escalas_locais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS "update_escalas_locais_updated_at" ON public.escalas_locais;
CREATE TRIGGER update_escalas_locais_updated_at
  BEFORE UPDATE ON public.escalas_locais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalas_locais_updated_at();

DROP TRIGGER IF EXISTS "update_escalas_setores_updated_at" ON public.escalas_setores;
CREATE TRIGGER update_escalas_setores_updated_at
  BEFORE UPDATE ON public.escalas_setores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalas_locais_updated_at();

-- 8. RLS POLICIES (Read-only para usuários autenticados)
ALTER TABLE public.escalas_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_inconsistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_alertas ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para todos autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar locais" ON public.escalas_locais;
CREATE POLICY "Usuários autenticados podem visualizar locais" 
  ON public.escalas_locais FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar setores" ON public.escalas_setores;
CREATE POLICY "Usuários autenticados podem visualizar setores" 
  ON public.escalas_setores FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar inconsistências" ON public.escalas_inconsistencias;
CREATE POLICY "Usuários autenticados podem visualizar inconsistências" 
  ON public.escalas_inconsistencias FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar alertas" ON public.escalas_alertas;
CREATE POLICY "Usuários autenticados podem visualizar alertas" 
  ON public.escalas_alertas FOR SELECT 
  TO authenticated 
  USING (true);

-- Admins podem gerenciar (para sincronização)
DROP POLICY IF EXISTS "Admins podem gerenciar locais" ON public.escalas_locais;
CREATE POLICY "Admins podem gerenciar locais" 
  ON public.escalas_locais FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins podem gerenciar setores" ON public.escalas_setores;
CREATE POLICY "Admins podem gerenciar setores" 
  ON public.escalas_setores FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins podem gerenciar inconsistências" ON public.escalas_inconsistencias;
CREATE POLICY "Admins podem gerenciar inconsistências" 
  ON public.escalas_inconsistencias FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins podem gerenciar alertas" ON public.escalas_alertas;
CREATE POLICY "Admins podem gerenciar alertas" 
  ON public.escalas_alertas FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

-- Permitir que usuários marquem alertas como lidos
DROP POLICY IF EXISTS "Usuários podem atualizar alertas (marcar como lido)" ON public.escalas_alertas;
CREATE POLICY "Usuários podem atualizar alertas (marcar como lido)" 
  ON public.escalas_alertas FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- === 20260130113112_78ee5369-8495-40ba-8b72-6d1b86334c5d.sql ===
-- Atualizar política RLS da tabela ages_propostas para incluir permissões de captadores
DROP POLICY IF EXISTS "Authorized users can manage ages_propostas" ON public.ages_propostas;

DROP POLICY IF EXISTS "Authorized users can manage ages_propostas" ON public.ages_propostas;
CREATE POLICY "Authorized users can manage ages_propostas" 
ON public.ages_propostas
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_ages'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_ages'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- === 20260130113610_72fea726-8469-43e0-a2a2-4b2b2ddf476a.sql ===
-- Adicionar coluna tipo na tabela proposta para diferenciar propostas de disparo vs personalizadas
DO $$ BEGIN ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'disparo' 
CHECK (tipo IN ('disparo', 'personalizada')); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adicionar coluna nome para identificar a proposta
DO $$ BEGIN ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS nome TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Atualizar propostas existentes com lead_id e sem servico_id como personalizadas
UPDATE public.proposta 
SET tipo = 'personalizada' 
WHERE lead_id IS NOT NULL 
  AND servico_id IS NULL 
  AND contrato_id IS NOT NULL 
  AND descricao LIKE '%Proposta para%';

-- Comentários para documentação
COMMENT ON COLUMN public.proposta.tipo IS 'Tipo da proposta: disparo (para campanhas de captação) ou personalizada (indicação direta com valor exclusivo)';
COMMENT ON COLUMN public.proposta.nome IS 'Nome identificador da proposta';

-- === 20260130114501_9f779f6c-3eb0-4f58-9481-21830a5110bb.sql ===
-- Remover constraint antiga de status
ALTER TABLE public.proposta DROP CONSTRAINT IF EXISTS proposta_status_check;

-- Adicionar nova constraint incluindo 'personalizada'
DO $$ BEGIN ALTER TABLE public.proposta ADD CONSTRAINT proposta_status_check 
CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada', 'cancelada', 'personalizada')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atualizar propostas personalizadas existentes
UPDATE public.proposta 
SET status = 'personalizada' 
WHERE tipo = 'personalizada' AND status = 'rascunho';

-- === 20260130120524_23bcade4-75bd-4071-b2fb-93a66196b2c1.sql ===
-- Atualizar constraint para incluir 'geral'
ALTER TABLE public.proposta DROP CONSTRAINT IF EXISTS proposta_status_check;
DO $$ BEGIN ALTER TABLE public.proposta ADD CONSTRAINT proposta_status_check 
CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada', 'cancelada', 'personalizada', 'geral', 'ativa')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Atualizar propostas de disparo existentes de 'rascunho' para 'geral'
UPDATE public.proposta 
SET status = 'geral' 
WHERE (tipo = 'disparo' OR tipo IS NULL) 
  AND status = 'rascunho'
  AND lead_id IS NULL;

-- === 20260130131442_544bade1-be5b-4d3b-bbfa-71e5a68bb8c6.sql ===
-- Tabela de locks de edição para licitações
CREATE TABLE IF NOT EXISTS public.licitacoes_edit_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacao_id uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(licitacao_id)
);

-- RLS: usuário pode ver todos os locks (para saber quem está editando)
ALTER TABLE public.licitacoes_edit_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all locks" ON public.licitacoes_edit_locks;
CREATE POLICY "Users can view all locks" ON public.licitacoes_edit_locks
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own locks" ON public.licitacoes_edit_locks;
CREATE POLICY "Users can insert own locks" ON public.licitacoes_edit_locks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own locks" ON public.licitacoes_edit_locks;
CREATE POLICY "Users can update own locks" ON public.licitacoes_edit_locks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own locks" ON public.licitacoes_edit_locks;
CREATE POLICY "Users can delete own locks" ON public.licitacoes_edit_locks
  FOR DELETE USING (auth.uid() = user_id);

-- Habilitar realtime para notificações instantâneas de lock/unlock
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacoes_edit_locks;

-- Função para cleanup de locks expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_edit_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.licitacoes_edit_locks WHERE expires_at < now();
END;
$$;

-- Função atômica para adquirir/renovar lock
CREATE OR REPLACE FUNCTION public.try_acquire_licitacao_lock(
  p_licitacao_id uuid,
  p_user_id uuid,
  p_user_name text,
  p_lock_duration_minutes int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_new_expires timestamptz;
BEGIN
  -- Limpar locks expirados primeiro
  DELETE FROM licitacoes_edit_locks WHERE expires_at < now();
  
  -- Verificar lock existente
  SELECT * INTO v_existing 
  FROM licitacoes_edit_locks 
  WHERE licitacao_id = p_licitacao_id;
  
  v_new_expires := now() + (p_lock_duration_minutes || ' minutes')::interval;
  
  IF v_existing IS NULL THEN
    -- Sem lock, criar novo
    INSERT INTO licitacoes_edit_locks (licitacao_id, user_id, user_name, expires_at)
    VALUES (p_licitacao_id, p_user_id, p_user_name, v_new_expires);
    
    RETURN jsonb_build_object(
      'success', true,
      'has_lock', true,
      'locked_by', null
    );
    
  ELSIF v_existing.user_id = p_user_id THEN
    -- Já tem o lock, renovar
    UPDATE licitacoes_edit_locks 
    SET expires_at = v_new_expires
    WHERE licitacao_id = p_licitacao_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'has_lock', true,
      'locked_by', null
    );
    
  ELSE
    -- Outro usuário tem o lock
    RETURN jsonb_build_object(
      'success', false,
      'has_lock', false,
      'locked_by', jsonb_build_object(
        'user_id', v_existing.user_id,
        'user_name', v_existing.user_name,
        'started_at', v_existing.started_at,
        'expires_at', v_existing.expires_at
      )
    );
  END IF;
END;
$$;

-- Função para liberar lock
CREATE OR REPLACE FUNCTION public.release_licitacao_lock(p_licitacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM licitacoes_edit_locks 
  WHERE licitacao_id = p_licitacao_id 
    AND user_id = auth.uid();
END;
$$;

-- === 20260130133957_6eace1c9-ab7f-4eeb-9a6f-680720dea39b.sql ===
-- Remover políticas duplicadas de INSERT
DROP POLICY IF EXISTS "Users can create tickets" ON public.suporte_tickets;
DROP POLICY IF EXISTS "Usuários podem criar tickets" ON public.suporte_tickets;

-- Criar nova política de INSERT que permite admins criarem em nome de outros
DROP POLICY IF EXISTS "Users can create tickets" ON public.suporte_tickets;
CREATE POLICY "Users can create tickets"
ON public.suporte_tickets FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = solicitante_id 
  OR is_admin(auth.uid())
);

-- === 20260202133116_670628fb-562b-4501-a74b-db86b16c99ea.sql ===
-- Primeiro, limpar duplicatas mantendo apenas a instância mais antiga de cada nome
-- Criar tabela temporária com IDs a manter
WITH ranked_instances AS (
  SELECT id, name, instance_uuid, status, created_at,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
  FROM sigzap_instances
  WHERE status != 'deleted'
),
instances_to_keep AS (
  SELECT id FROM ranked_instances WHERE rn = 1
),
instances_to_delete AS (
  SELECT id FROM sigzap_instances 
  WHERE id NOT IN (SELECT id FROM instances_to_keep)
  AND status != 'deleted'
)
-- Marcar duplicatas como deleted (não deletar para preservar histórico)
UPDATE sigzap_instances 
SET status = 'deleted', 
    name = name || '_dup_' || LEFT(id::text, 8)
WHERE id IN (SELECT id FROM instances_to_delete);

-- Agora adicionar índice único para evitar futuras duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS sigzap_instances_name_unique 
ON sigzap_instances(name) 
WHERE status != 'deleted';

-- === 20260202200540_4f337fdd-426b-4578-aa01-5cf9dd04d905.sql ===
-- Atualizar política RLS de medico_kanban_cards para incluir captadores
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards;

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards;
CREATE POLICY "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);

-- === 20260203145427_34eff3e7-e448-4d82-ad72-23baad2633dd.sql ===
-- Remover trigger de auditoria automática da tabela contratos
-- O registro de auditoria é feito pelo frontend com informações mais detalhadas
DROP TRIGGER IF EXISTS audit_contratos ON public.contratos;

-- === 20260204122138_d6b80957-2bba-49ef-8e66-ec2b3ac33490.sql ===
-- Remover a constraint antiga que exige 30 caracteres
ALTER TABLE licitacao_descartes DROP CONSTRAINT licitacao_descartes_justificativa_check;

-- Adicionar nova constraint que exige apenas 10 caracteres
DO $$ BEGIN ALTER TABLE licitacao_descartes ADD CONSTRAINT licitacao_descartes_justificativa_check CHECK (char_length(justificativa) >= 10); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === 20260205112730_74f6cf44-9263-4e7f-a75e-e659ad941407.sql ===

-- Remover política atual de gerenciamento
DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;

-- Política para INSERT: admins, gestores OU captadores com permissão pode_blacklist
DROP POLICY IF EXISTS "Authorized users can insert blacklist" ON public.blacklist;
CREATE POLICY "Authorized users can insert blacklist"
ON public.blacklist
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_captacao_permission(auth.uid(), 'blacklist')
);

-- Política para UPDATE/DELETE: apenas admins e gestores (remoção restrita)
DROP POLICY IF EXISTS "Admins and managers can update/delete blacklist" ON public.blacklist;
CREATE POLICY "Admins and managers can update/delete blacklist"
ON public.blacklist
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);


-- === 20260206170601_68a8ad3b-3cc0-4e8c-948b-dc97a97ce511.sql ===

-- Adicionar coluna ia_ativa em disparos_campanhas
DO $$ BEGIN ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS ia_ativa boolean NOT NULL DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar tabela de logs da IA
CREATE TABLE IF NOT EXISTS public.disparos_ia_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id uuid NOT NULL REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES public.disparos_contatos(id) ON DELETE SET NULL,
  telefone_medico text NOT NULL,
  nome_medico text,
  mensagem_medico text NOT NULL,
  resposta_ia text NOT NULL,
  contexto_usado jsonb,
  transferido_humano boolean NOT NULL DEFAULT false,
  gatilho_transferencia text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.disparos_ia_logs ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados
DROP POLICY IF EXISTS "Authenticated users can view IA logs" ON public.disparos_ia_logs;
CREATE POLICY "Authenticated users can view IA logs" 
ON public.disparos_ia_logs 
FOR SELECT 
TO authenticated
USING (true);

-- Política de inserção para service role (edge functions)
DROP POLICY IF EXISTS "Service role can insert IA logs" ON public.disparos_ia_logs;
CREATE POLICY "Service role can insert IA logs" 
ON public.disparos_ia_logs 
FOR INSERT 
WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_disparos_ia_logs_campanha ON public.disparos_ia_logs(campanha_id);
CREATE INDEX IF NOT EXISTS idx_disparos_ia_logs_telefone ON public.disparos_ia_logs(telefone_medico);
CREATE INDEX IF NOT EXISTS idx_disparos_ia_logs_created ON public.disparos_ia_logs(created_at DESC);

-- Habilitar realtime para acompanhar logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_ia_logs;


-- === 20260209114228_c618ee55-a675-4c6d-af3f-bb76dd8abf4e.sql ===
-- Storage policies for user-notas-anexos bucket
DROP POLICY IF EXISTS "Users can upload their own nota files" ON storage.objects;
CREATE POLICY "Users can upload their own nota files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can view their own nota files" ON storage.objects;
CREATE POLICY "Users can view their own nota files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete their own nota files" ON storage.objects;
CREATE POLICY "Users can delete their own nota files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);


-- === 20260209130858_8f65663c-0169-436f-957f-392531c181e8.sql ===
-- Allow all authenticated users to read the licitacao_webhook_url key
DROP POLICY IF EXISTS "All authenticated can read licitacao_webhook_url" ON public.supabase_config;
CREATE POLICY "All authenticated can read licitacao_webhook_url"
ON public.supabase_config
FOR SELECT
TO authenticated
USING (chave = 'licitacao_webhook_url');


-- === 20260209180723_cb3be2c7-889f-43f4-ae75-da6c6b2a7462.sql ===

-- 1. Renomear coluna modalidade para subtipo_modalidade
ALTER TABLE public.licitacoes RENAME COLUMN modalidade TO subtipo_modalidade;

-- 2. Criar coluna tipo_modalidade
DO $$ BEGIN ALTER TABLE public.licitacoes ADD COLUMN tipo_modalidade text; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3. Popular tipo_modalidade baseado nos valores existentes de subtipo_modalidade
UPDATE public.licitacoes
SET tipo_modalidade = CASE
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRENCIA%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRÊNCIA%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CREDENCIAMENTO%' THEN 'PROC. AUXILIAR'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%DISPENSA%' THEN 'CONTR. DIRETA'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%INEXIGIBILIDADE%' THEN 'CONTR. DIRETA'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CHAMAMENTO%' THEN 'PROC. AUXILIAR'
  ELSE NULL
END
WHERE subtipo_modalidade IS NOT NULL;

-- 4. Normalizar subtipo_modalidade para valores padronizados
UPDATE public.licitacoes
SET subtipo_modalidade = 'Pregão Eletrônico'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%ELETRONICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%ELETRÔNICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%ELETRÔNICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%ELETRONICO%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Pregão Presencial'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%PRESENCIAL%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%PRESENCIAL%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Concorrência'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRENCIA%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRÊNCIA%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Credenciamento'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CREDENCIAMENTO%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Dispensa'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%DISPENSA%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Inexigibilidade'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%INEXIGIBILIDADE%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Edital Chamamento'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CHAMAMENTO%';


-- === 20260210114615_d215f1c2-1d77-48bb-b823-cf9f959feea9.sql ===

-- Trigger: notificar admins quando ticket é aberto
CREATE OR REPLACE FUNCTION public.notify_ticket_aberto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- Notificar todos os admins sobre novo ticket
  FOR admin_record IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  LOOP
    -- Não notificar o próprio solicitante se for admin
    IF admin_record.user_id != NEW.solicitante_id THEN
      INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
      VALUES (
        admin_record.user_id,
        'suporte_novo_ticket',
        'Novo ticket de suporte: ' || COALESCE(NEW.numero, ''),
        COALESCE(NEW.solicitante_nome, 'Usuário') || ' abriu um ticket: ' || LEFT(COALESCE(NEW.descricao, ''), 100),
        '/suporte',
        NEW.id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_notify_ticket_aberto" ON public.suporte_tickets;
CREATE TRIGGER trg_notify_ticket_aberto
AFTER INSERT ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_aberto();

-- Trigger: notificar quando comentário é adicionado
CREATE OR REPLACE FUNCTION public.notify_ticket_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ticket RECORD;
  admin_record RECORD;
  v_is_admin BOOLEAN;
BEGIN
  -- Buscar dados do ticket
  SELECT * INTO v_ticket FROM public.suporte_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Verificar se o autor do comentário é admin
  v_is_admin := public.is_admin(NEW.autor_id);

  IF v_is_admin THEN
    -- Admin respondeu → notificar o solicitante
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      v_ticket.solicitante_id,
      'suporte_resposta',
      'Resposta no ticket ' || COALESCE(v_ticket.numero, ''),
      COALESCE(NEW.autor_nome, 'Suporte') || ' respondeu: ' || LEFT(COALESCE(NEW.mensagem, ''), 100),
      '/suporte',
      v_ticket.id
    );
  ELSE
    -- Usuário respondeu → notificar admins e responsável TI
    FOR admin_record IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
      UNION
      SELECT v_ticket.responsavel_ti_id WHERE v_ticket.responsavel_ti_id IS NOT NULL
    LOOP
      IF admin_record.user_id != NEW.autor_id THEN
        INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
        VALUES (
          admin_record.user_id,
          'suporte_usuario_respondeu',
          'Resposta do usuário no ticket ' || COALESCE(v_ticket.numero, ''),
          COALESCE(NEW.autor_nome, 'Usuário') || ': ' || LEFT(COALESCE(NEW.mensagem, ''), 100),
          '/suporte',
          v_ticket.id
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_notify_ticket_comentario" ON public.suporte_comentarios;
CREATE TRIGGER trg_notify_ticket_comentario
AFTER INSERT ON public.suporte_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_comentario();

-- Trigger: notificar quando ticket é finalizado
CREATE OR REPLACE FUNCTION public.notify_ticket_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Só dispara se o status mudou para 'concluido'
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    -- Notificar o solicitante
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      NEW.solicitante_id,
      'suporte_finalizado',
      'Ticket finalizado: ' || COALESCE(NEW.numero, ''),
      'Seu ticket foi finalizado por ' || COALESCE(NEW.resolvido_por_nome, 'Suporte TI'),
      '/suporte',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_notify_ticket_finalizado" ON public.suporte_tickets;
CREATE TRIGGER trg_notify_ticket_finalizado
AFTER UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_finalizado();


-- === 20260210114803_b9b8b460-82de-4654-803a-3513ff728f20.sql ===

CREATE OR REPLACE FUNCTION public.notify_ticket_finalizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ticket finalizado
  IF NEW.status = 'concluido' AND (OLD.status IS DISTINCT FROM 'concluido') THEN
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      NEW.solicitante_id,
      'suporte_finalizado',
      'Ticket finalizado: ' || COALESCE(NEW.numero, ''),
      'Seu ticket foi finalizado por ' || COALESCE(NEW.resolvido_por_nome, 'Suporte TI'),
      '/suporte',
      NEW.id
    );
  END IF;

  -- Ticket aguardando confirmação do usuário
  IF NEW.status = 'aguardando_confirmacao' AND (OLD.status IS DISTINCT FROM 'aguardando_confirmacao') THEN
    INSERT INTO public.system_notifications (user_id, tipo, titulo, mensagem, link, referencia_id)
    VALUES (
      NEW.solicitante_id,
      'suporte_aguardando_confirmacao',
      'Ação necessária: Ticket ' || COALESCE(NEW.numero, ''),
      'Seu ticket está aguardando sua confirmação. Por favor, verifique e confirme.',
      '/suporte',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;


-- === 20260212174430_2c13859d-7409-4fbb-b6b3-8491962d7734.sql ===

-- Drop the restrictive admin/leader SELECT policy
DROP POLICY IF EXISTS "Admins e líderes podem visualizar todos os tickets" ON public.suporte_tickets;

-- Recreate it to include 'externos' role users: they see tickets without responsável OR where they are responsável
DROP POLICY IF EXISTS "Admins líderes e externos podem visualizar tickets" ON public.suporte_tickets;
CREATE POLICY "Admins líderes e externos podem visualizar tickets"
ON public.suporte_tickets
FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid())
  OR (
    has_role(auth.uid(), 'externos') 
    AND (responsavel_ti_id IS NULL OR responsavel_ti_id = auth.uid())
  )
);

-- Also allow externos to update tickets they can see
DROP POLICY IF EXISTS "Admins e líderes podem atualizar todos os tickets" ON public.suporte_tickets;

DROP POLICY IF EXISTS "Admins líderes e externos podem atualizar tickets" ON public.suporte_tickets;
CREATE POLICY "Admins líderes e externos podem atualizar tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid())
  OR (
    has_role(auth.uid(), 'externos') 
    AND (responsavel_ti_id IS NULL OR responsavel_ti_id = auth.uid())
  )
);


-- === 20260212174510_55c029fe-f956-4973-bf9b-6693707fd985.sql ===

-- Update comentarios SELECT policy to include externos
DROP POLICY IF EXISTS "Users can view comments on their tickets" ON public.suporte_comentarios;

DROP POLICY IF EXISTS "Users can view comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can view comments on their tickets"
ON public.suporte_comentarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM suporte_tickets
    WHERE suporte_tickets.id = suporte_comentarios.ticket_id
    AND (
      suporte_tickets.solicitante_id = auth.uid()
      OR is_admin(auth.uid())
      OR is_leader(auth.uid())
      OR (
        has_role(auth.uid(), 'externos')
        AND (suporte_tickets.responsavel_ti_id IS NULL OR suporte_tickets.responsavel_ti_id = auth.uid())
      )
    )
  )
);


-- === 20260212193440_c835f571-2619-49f6-8eec-0cc1d7bad3f4.sql ===
-- Criar cron job para verificar documentos vencidos/próximos do vencimento diariamente às 8h
SELECT cron.schedule(
  'check-document-expiry-daily',
  '0 11 * * *', -- 11:00 UTC = 08:00 BRT
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-document-expiry',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- === 20260212193825_7e410cbf-d11e-48e8-a3ee-68739be7b6f5.sql ===
-- Adicionar campo de data de validade nos anexos de leads
DO $$ BEGIN ALTER TABLE public.lead_anexos ADD COLUMN data_validade DATE DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- === 20260212194635_9bb4c658-2f80-4209-8f26-04d4904c510a.sql ===
DROP POLICY IF EXISTS "Authenticated users can update lead attachments" ON public.lead_anexos;
CREATE POLICY "Authenticated users can update lead attachments"
ON public.lead_anexos
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- === 20260212194958_19d27863-4c31-4798-ad5a-f132618be7c5.sql ===
DROP POLICY "Admins líderes e externos podem atualizar tickets" ON public.suporte_tickets;

DROP POLICY IF EXISTS "Admins líderes e externos podem atualizar tickets" ON public.suporte_tickets;
CREATE POLICY "Admins líderes e externos podem atualizar tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid()) 
  OR has_role(auth.uid(), 'externos'::app_role)
);

-- === 20260213104335_7de50b51-2117-4c56-a7cd-eb3abf266722.sql ===

-- Add sent_by_user_id to track which user sent each message
DO $$ BEGIN ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_by_user_id uuid DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add instance_name to track which instance was used
DO $$ BEGIN ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_via_instance_name text DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Index for querying by sender
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_sent_by ON public.sigzap_messages(sent_by_user_id) WHERE sent_by_user_id IS NOT NULL;


-- === 20260213174408_7189f41e-ad2a-4275-98f2-e9783cd7086d.sql ===
-- Fix trigger function referencing old 'modalidade' column (now 'tipo_modalidade')
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS TRIGGER AS $$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- 1. CRIAR CONTRATO REAL
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato, data_inicio, data_fim, status_contrato,
        licitacao_origem_id, valor_estimado, objeto_contrato, assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(NEW.objeto, 500),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      PERFORM log_auditoria(
        'Contratos', 'contratos', 'INSERT', novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    -- 2. Criar contrato_rascunho para Kanban
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id, status, status_kanban, overlay_json, servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'tipo_modalidade', NEW.tipo_modalidade,
          'subtipo_modalidade', NEW.subtipo_modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      PERFORM log_auditoria(
        'Licitações', 'contrato_rascunho', 'INSERT', novo_rascunho_id::text,
        'Contrato temporário criado da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also remove duplicate triggers (there are 3 triggers calling the same function)
DROP TRIGGER IF EXISTS trigger_create_captacao_card_on_arrematados ON public.licitacoes;
DROP TRIGGER IF EXISTS trigger_licitacao_arrematada ON public.licitacoes;

-- === 20260216184726_36bb4111-eb54-49cd-9359-e5f3bc5c9a19.sql ===

-- Table to track leads sent to "Região de Interesse"
CREATE TABLE IF NOT EXISTS public.regiao_interesse_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  encaminhado_por UUID REFERENCES auth.users(id),
  encaminhado_por_nome TEXT,
  ufs TEXT[] DEFAULT '{}',
  cidades TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);