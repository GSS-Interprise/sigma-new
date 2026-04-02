-- Tabela de locks de edição para licitações
CREATE TABLE public.licitacoes_edit_locks (
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

CREATE POLICY "Users can view all locks" ON public.licitacoes_edit_locks
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own locks" ON public.licitacoes_edit_locks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locks" ON public.licitacoes_edit_locks
  FOR UPDATE USING (auth.uid() = user_id);

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