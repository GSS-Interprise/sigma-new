
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
ALTER TABLE licitacao_descartes ADD CONSTRAINT licitacao_descartes_justificativa_check CHECK (char_length(justificativa) >= 10);

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
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS ia_ativa boolean NOT NULL DEFAULT false;

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
ALTER TABLE public.licitacoes ADD COLUMN tipo_modalidade text;

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
ALTER TABLE public.lead_anexos ADD COLUMN data_validade DATE DEFAULT NULL;


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
ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_by_user_id uuid DEFAULT NULL;

-- Add instance_name to track which instance was used
ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_via_instance_name text DEFAULT NULL;

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

-- Enable RLS
ALTER TABLE public.regiao_interesse_leads ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
DROP POLICY IF EXISTS "Authenticated users can view regiao_interesse_leads" ON public.regiao_interesse_leads;
CREATE POLICY "Authenticated users can view regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR SELECT
  TO authenticated USING (true);

-- Authenticated users can insert
DROP POLICY IF EXISTS "Authenticated users can insert regiao_interesse_leads" ON public.regiao_interesse_leads;
CREATE POLICY "Authenticated users can insert regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR INSERT
  TO authenticated WITH CHECK (true);

-- Authenticated users can delete
DROP POLICY IF EXISTS "Authenticated users can delete regiao_interesse_leads" ON public.regiao_interesse_leads;
CREATE POLICY "Authenticated users can delete regiao_interesse_leads"
  ON public.regiao_interesse_leads FOR DELETE
  TO authenticated USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_regiao_interesse_leads_lead_id ON public.regiao_interesse_leads(lead_id);


-- === 20260216195758_9e6a02f4-f52f-412e-81a9-c68367901382.sql ===

-- Table to track modules in maintenance mode
CREATE TABLE IF NOT EXISTS public.modulos_manutencao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_key text NOT NULL UNIQUE,
  motivo text,
  desativado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modulos_manutencao ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read (to check if module is disabled)
DROP POLICY IF EXISTS "Authenticated users can view maintenance status" ON public.modulos_manutencao;
CREATE POLICY "Authenticated users can view maintenance status"
ON public.modulos_manutencao FOR SELECT TO authenticated USING (true);

-- Only admins can insert/delete
DROP POLICY IF EXISTS "Admins can insert maintenance" ON public.modulos_manutencao;
CREATE POLICY "Admins can insert maintenance"
ON public.modulos_manutencao FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete maintenance" ON public.modulos_manutencao;
CREATE POLICY "Admins can delete maintenance"
ON public.modulos_manutencao FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));


-- === 20260218114815_f8345d88-77e1-4761-a5a0-6678246eb25d.sql ===
-- Add storage policies for suporte-anexos bucket
-- Allow all authenticated users to upload (they need to attach files to tickets)
DROP POLICY IF EXISTS "Authenticated users can upload suporte anexos" ON storage.objects;
CREATE POLICY "Authenticated users can upload suporte anexos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'suporte-anexos');

-- Allow all authenticated users to view/download
DROP POLICY IF EXISTS "Authenticated users can view suporte anexos" ON storage.objects;
CREATE POLICY "Authenticated users can view suporte anexos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'suporte-anexos');

-- Allow all authenticated users to delete their own uploads
DROP POLICY IF EXISTS "Authenticated users can delete suporte anexos" ON storage.objects;
CREATE POLICY "Authenticated users can delete suporte anexos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'suporte-anexos');

-- === 20260218115824_bb8ee126-30b0-488e-9308-57dbccb609f7.sql ===
-- Drop the existing INSERT policy
DROP POLICY "Users can create comments on their tickets" ON public.suporte_comentarios;

-- Recreate with support for 'externos' role
DROP POLICY IF EXISTS "Users can create comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = autor_id
  AND (
    EXISTS (
      SELECT 1 FROM suporte_tickets
      WHERE suporte_tickets.id = suporte_comentarios.ticket_id
      AND (
        suporte_tickets.solicitante_id = auth.uid()
        OR is_admin(auth.uid())
        OR has_role(auth.uid(), 'externos')
      )
    )
    OR auth.role() = 'service_role'
  )
);


-- === 20260218142719_7a04350e-3d88-4e87-9ad9-3e4babdb75c3.sql ===
-- Add unique constraint on 'name' column for sigzap_instances
-- This is needed for the upsert in receive-whatsapp-messages edge function
ALTER TABLE public.sigzap_instances ADD CONSTRAINT sigzap_instances_name_key UNIQUE (name);

-- === 20260218144731_e7108012-642a-4c13-bd90-5a7dfbf029bd.sql ===

-- Add created_by column to chips table to track who created each instance
ALTER TABLE public.chips ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Also add created_by_name for display without needing joins
ALTER TABLE public.chips ADD COLUMN created_by_name text;


-- === 20260218182934_f1485469-598e-4c48-88ff-42c12d57e461.sql ===

-- Allow captacao users (like Brenda) to insert proposta_itens when cloning proposals
DROP POLICY IF EXISTS "Captadores podem inserir proposta_itens" ON public.proposta_itens;
CREATE POLICY "Captadores podem inserir proposta_itens"
ON public.proposta_itens
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- Also allow them to update proposta_itens (for editing linked proposals)
DROP POLICY IF EXISTS "Captadores podem atualizar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Captadores podem atualizar proposta_itens"
ON public.proposta_itens
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- Also allow delete for captadores
DROP POLICY IF EXISTS "Captadores podem deletar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Captadores podem deletar proposta_itens"
ON public.proposta_itens
FOR DELETE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);


-- === 20260218182958_84e7c032-0197-4d2e-a38f-943ee38cf9a9.sql ===

-- Drop the old restrictive ALL policy that only allowed gestores
DROP POLICY IF EXISTS "Gestores podem gerenciar proposta_itens" ON public.proposta_itens;


-- === 20260223184151_058592d3-7b89-44f5-a539-ebe0adb8a23e.sql ===

-- 1. Adicionar coluna especialidades_crua
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS especialidades_crua TEXT;

-- 2. Limpar CPFs duplicados (manter o mais recente)
DELETE FROM leads 
WHERE id NOT IN (
  SELECT DISTINCT ON (cpf) id 
  FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  ORDER BY cpf, updated_at DESC NULLS LAST
)
AND cpf IN (
  SELECT cpf FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  GROUP BY cpf HAVING COUNT(*) > 1
);

-- 3. Criar indice unique parcial no CPF
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cpf_unique 
ON public.leads (cpf) WHERE cpf IS NOT NULL AND TRIM(cpf) != '';

-- 4. Relaxar phone_e164 (permitir NULL)
ALTER TABLE public.leads ALTER COLUMN phone_e164 DROP NOT NULL;

-- 5. Atualizar trigger chave_unica para priorizar CPF
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cpf IS NOT NULL AND TRIM(NEW.cpf) != '' THEN
    NEW.chave_unica := 'cpf_' || REGEXP_REPLACE(NEW.cpf, '[^0-9]', '', 'g');
  ELSIF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;
  RETURN NEW;
END;
$function$;


-- === 20260223185012_5aa11ac1-1548-4c72-bf6e-3d3402a0c336.sql ===

-- 1. Limpar leads com CPF duplicado (manter o mais recente por updated_at)
DELETE FROM public.leads a
USING public.leads b
WHERE a.id != b.id
  AND a.cpf IS NOT NULL AND TRIM(a.cpf) != ''
  AND b.cpf IS NOT NULL AND TRIM(b.cpf) != ''
  AND REGEXP_REPLACE(a.cpf, '[^0-9]', '', 'g') = REGEXP_REPLACE(b.cpf, '[^0-9]', '', 'g')
  AND a.updated_at < b.updated_at;

-- 2. Criar tabela especialidades normalizada
CREATE TABLE IF NOT EXISTS public.especialidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Especialidades são visíveis por todos autenticados" ON public.especialidades;
CREATE POLICY "Especialidades são visíveis por todos autenticados"
  ON public.especialidades FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins podem gerenciar especialidades" ON public.especialidades;
CREATE POLICY "Admins podem gerenciar especialidades"
  ON public.especialidades FOR ALL
  USING (public.is_admin(auth.uid()));

-- 3. Popular com dados existentes
INSERT INTO public.especialidades (nome)
SELECT DISTINCT UPPER(TRIM(especialidade))
FROM public.leads
WHERE especialidade IS NOT NULL AND TRIM(especialidade) != ''
ON CONFLICT (nome) DO NOTHING;

-- 4. Adicionar FK na tabela leads
ALTER TABLE public.leads ADD COLUMN especialidade_id UUID REFERENCES public.especialidades(id);
CREATE INDEX IF NOT EXISTS idx_leads_especialidade_id ON public.leads (especialidade_id);

-- 5. Dropar triggers de user-land temporariamente
DROP TRIGGER IF EXISTS trigger_lead_chave_unica ON public.leads;
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
DROP TRIGGER IF EXISTS validate_lead_status_trigger ON public.leads;

-- 6. Preencher especialidade_id
UPDATE public.leads l
SET especialidade_id = e.id
FROM public.especialidades e
WHERE UPPER(TRIM(l.especialidade)) = e.nome
  AND l.especialidade IS NOT NULL
  AND TRIM(l.especialidade) != '';

-- 7. Recriar triggers
CREATE TRIGGER trigger_lead_chave_unica
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.generate_lead_chave_unica();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER validate_lead_status_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_lead_status();

-- 8. Índices para SELECT DISTINCT
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads (origem) WHERE origem IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_uf ON public.leads (uf) WHERE uf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON public.leads (cidade) WHERE cidade IS NOT NULL;


-- === 20260223190713_567fd19f-51ca-4059-b8e0-02bd0a0c9f58.sql ===
CREATE OR REPLACE FUNCTION public.get_leads_especialidade_counts()
RETURNS TABLE(especialidade_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT especialidade_id, count(*) as count
  FROM public.leads
  WHERE especialidade_id IS NOT NULL
  GROUP BY especialidade_id;
$$;

-- === 20260223190910_46928d6b-9994-49ba-823d-fa17d2a1d9d9.sql ===
CREATE OR REPLACE FUNCTION public.get_leads_filter_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'status', (SELECT jsonb_object_agg(status, cnt) FROM (SELECT status, count(*) as cnt FROM leads WHERE status IS NOT NULL AND status != '' GROUP BY status) s),
    'origem', (SELECT jsonb_object_agg(origem, cnt) FROM (SELECT origem, count(*) as cnt FROM leads WHERE origem IS NOT NULL AND origem != '' GROUP BY origem) o),
    'uf', (SELECT jsonb_object_agg(uf, cnt) FROM (SELECT uf, count(*) as cnt FROM leads WHERE uf IS NOT NULL AND uf != '' GROUP BY uf) u),
    'cidade', (SELECT jsonb_object_agg(cidade, cnt) FROM (SELECT cidade, count(*) as cnt FROM leads WHERE cidade IS NOT NULL AND cidade != '' GROUP BY cidade) c),
    'especialidade', (SELECT jsonb_object_agg(especialidade_id::text, cnt) FROM (SELECT especialidade_id, count(*) as cnt FROM leads WHERE especialidade_id IS NOT NULL GROUP BY especialidade_id) e)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- === 20260226124700_2e35531b-b32f-4aed-a136-5cd306028fd1.sql ===
-- Adicionar gestor_financeiro e outros roles às policies de contrato_anexos
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'gestor_financeiro') OR
  has_role(auth.uid(), 'diretoria') OR
  has_role(auth.uid(), 'lideres') OR
  has_role(auth.uid(), 'coordenador_escalas') OR
  is_captacao_leader(auth.uid())
);

-- Também adicionar storage policy para contratos-documentos para gestor_financeiro
-- (o bucket contratos-documentos já tem policy via storage.objects)


-- === 20260226132425_99961531-eb69-4414-92e2-f30dd07258b0.sql ===
ALTER TABLE public.licitacoes ADD COLUMN IF NOT EXISTS objeto_contrato TEXT;

-- === 20260226135938_499daed8-5d9d-4d84-92ef-12e19abb6454.sql ===
ALTER TABLE public.licitacoes ADD COLUMN IF NOT EXISTS cnpj_orgao text;

-- === 20260226140635_8caf1781-6316-405d-a274-b9d4537e2dc7.sql ===

DROP POLICY IF EXISTS "Financeiro e líderes podem visualizar contrato_itens" ON public.contrato_itens;
CREATE POLICY "Financeiro e líderes podem visualizar contrato_itens"
ON public.contrato_itens
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
  has_role(auth.uid(), 'diretoria'::app_role) OR
  has_role(auth.uid(), 'lideres'::app_role) OR
  has_role(auth.uid(), 'coordenador_escalas'::app_role)
);


-- === 20260303190730_74354ccc-ccb8-40f6-91dc-5308fc5eac4e.sql ===

ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS api_enrich_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS api_enrich_last_attempt timestamptz,
  ADD COLUMN IF NOT EXISTS api_enrich_source text;

CREATE INDEX IF NOT EXISTS idx_leads_enrich_status 
  ON public.leads(api_enrich_status, api_enrich_last_attempt);


-- === 20260310122931_f9ff8d80-1a0e-4651-8a77-a8fc92809ca3.sql ===

-- Corrigir rascunhos que já têm contrato_id mas estão com status 'rascunho'
-- Esses registros já foram consolidados mas a atualização de status falhou
UPDATE contrato_rascunho
SET 
  status = 'consolidado',
  consolidado_em = COALESCE(consolidado_em, updated_at, created_at)
WHERE 
  status = 'rascunho' 
  AND contrato_id IS NOT NULL;


-- === 20260312124412_caeee496-f20c-4ad9-8aa4-f87404bfd812.sql ===

-- Remove a constraint UNIQUE de 'numero' (não faz sentido, múltiplas instâncias podem compartilhar número)
ALTER TABLE public.chips DROP CONSTRAINT IF EXISTS chips_numero_key;

-- Adiciona UNIQUE em instance_name para permitir UPSERT correto
ALTER TABLE public.chips ADD CONSTRAINT chips_instance_name_key UNIQUE (instance_name);


-- === 20260312194816_5f5b89e1-bf13-4b5c-acef-39614d6e0af7.sql ===
ALTER TABLE captacao_permissoes_usuario ADD COLUMN IF NOT EXISTS realtime_licitacoes boolean NOT NULL DEFAULT false;

-- === 20260317135448_93e06409-b15d-487b-be1a-bc7d60bc2e71.sql ===

CREATE TABLE IF NOT EXISTS public.import_leads_failed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  resolved_at timestamptz,
  lead_id uuid
);

CREATE INDEX IF NOT EXISTS idx_import_leads_failed_queue_status_retry 
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.import_leads_failed_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to failed queue" ON public.import_leads_failed_queue;
CREATE POLICY "Service role full access to failed queue"
  ON public.import_leads_failed_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- === 20260317143138_c74a68da-9903-4356-a0c7-455585fdbd26.sql ===

-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue
ALTER TABLE public.import_leads_failed_queue
  ADD COLUMN IF NOT EXISTS abandonment_reason text;

COMMENT ON COLUMN public.import_leads_failed_queue.abandonment_reason IS 
  'Motivo do abandono: invalid_payload | phone_conflict_unresolvable | lead_not_found | max_retries_exceeded | timeout | unknown_error';

CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason 
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE abandonment_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_queue_retry_scan
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';


-- === 20260317163027_fab2a3e0-f594-4fb4-b147-5e471d0741fe.sql ===

-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'import_leads_failed_queue'
      AND column_name = 'abandonment_reason'
  ) THEN
    ALTER TABLE public.import_leads_failed_queue
      ADD COLUMN abandonment_reason text;
  END IF;
END;
$$;

-- Index para facilitar diagnóstico por razão de abandono
CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE status = 'abandoned';

-- Index composto para o cron: busca por pending + next_retry_at
CREATE INDEX IF NOT EXISTS idx_failed_queue_pending_retry
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';


-- === 20260317185753_c3c13eb3-2711-4972-b594-42e406e7018e.sql ===

-- Drop políticas existentes conflitantes
DROP POLICY IF EXISTS "Admins podem visualizar todos os logs" ON public.auditoria_logs;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios logs" ON public.auditoria_logs;

-- Política única consolidada: admin e líder veem tudo; usuário normal vê apenas os seus
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  is_admin(auth.uid())
  OR is_leader(auth.uid())
  OR (auth.uid() = usuario_id)
);


-- === 20260317190305_d296c7a2-60af-4c29-8d3f-0a2e4356bb7d.sql ===

-- Atualizar política RLS: apenas admins podem visualizar logs de auditoria
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (is_admin(auth.uid()));


-- === 20260317190547_f4f913a4-6575-4015-82f7-d35211418aba.sql ===

-- Substituir por política direta sem depender da função is_admin
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);


-- === 20260318172631_74a307c6-1526-47b3-9576-92cabb22795d.sql ===

CREATE INDEX IF NOT EXISTS idx_leads_cpf_digits 
ON public.leads (REGEXP_REPLACE(cpf, '\D', '', 'g'))
WHERE cpf IS NOT NULL;


-- === 20260325173640_b9ae8d14-6912-4cd7-86f8-c2aacaa63c59.sql ===
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS emails_adicionais text[] DEFAULT '{}';

-- === 20260325182106_2fc9c5b4-d1e2-4d29-afe2-904d3fdc9026.sql ===
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_formatura date;

-- === 20260326122101_f11b47f3-3bd5-47e4-acbe-f68cfd4f7fdb.sql ===

-- Create leads_bloqueio_temporario table
CREATE TABLE IF NOT EXISTS public.leads_bloqueio_temporario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by UUID
);

-- Enable RLS
ALTER TABLE public.leads_bloqueio_temporario ENABLE ROW LEVEL SECURITY;

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_leads_bloqueio_lead_id ON public.leads_bloqueio_temporario(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_bloqueio_active ON public.leads_bloqueio_temporario(lead_id) WHERE removed_at IS NULL;

-- SELECT: all authenticated users
DROP POLICY IF EXISTS "Authenticated can view bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can view bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated users (must set their own created_by)
DROP POLICY IF EXISTS "Authenticated can insert bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can insert bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- UPDATE (unblocking - setting removed_at): all authenticated users
DROP POLICY IF EXISTS "Authenticated can update bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can update bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: only admin / gestor_captacao
DROP POLICY IF EXISTS "Admins can delete bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Admins can delete bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_captacao')
  );


-- === 20260326135243_b17cec99-daf2-422e-9e7e-f85eba5801b6.sql ===

-- =====================================================================
-- FIX 1: Update trigger — only recalculate chave_unica when relevant
-- fields change (prevents conflict on enrichment-only updates)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- On UPDATE: skip recalculation if CPF, nome and data_nascimento are unchanged
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.cpf IS NOT DISTINCT FROM OLD.cpf)
       AND (NEW.nome IS NOT DISTINCT FROM OLD.nome)
       AND (NEW.data_nascimento IS NOT DISTINCT FROM OLD.data_nascimento) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- (Re)calculate chave_unica
  IF NEW.cpf IS NOT NULL AND TRIM(NEW.cpf) != '' THEN
    NEW.chave_unica := 'cpf_' || REGEXP_REPLACE(NEW.cpf, '[^0-9]', '', 'g');
  ELSIF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- FIX 2: Clean up duplicate leads
-- DELETE newer duplicates FIRST, then fix chave_unica on the kept ones
-- =====================================================================

-- cpf 00857458043: remove newer (22217718), then fix older (2b786cfa)
DELETE FROM leads WHERE id = '22217718-9dfb-49ea-a222-7b63737d780d';