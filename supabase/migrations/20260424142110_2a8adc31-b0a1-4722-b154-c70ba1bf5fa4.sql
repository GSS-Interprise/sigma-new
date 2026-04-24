
-- 1. Novas colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ultima_resposta_em timestamptz,
  ADD COLUMN IF NOT EXISTS automacao_status_travada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_auto_status
  ON public.leads (status, automacao_status_travada, ultimo_disparo_em);

-- 2. Helper: detecta se update veio de ação humana (sessão autenticada)
CREATE OR REPLACE FUNCTION public.is_user_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND coalesce(current_setting('app.automacao_sistema', true), '') <> '1';
$$;

-- 3. Trigger: marcar travamento quando humano move status
CREATE OR REPLACE FUNCTION public.fn_leads_status_manual_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND public.is_user_session() THEN
    NEW.automacao_status_travada := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_manual_lock ON public.leads;
CREATE TRIGGER trg_leads_status_manual_lock
BEFORE UPDATE OF status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_leads_status_manual_lock();

-- 4. Trigger: novo disparo reseta automação e promove para Acompanhamento
CREATE OR REPLACE FUNCTION public.fn_leads_disparo_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ultimo_disparo_em IS DISTINCT FROM OLD.ultimo_disparo_em
     AND NEW.ultimo_disparo_em IS NOT NULL THEN
    NEW.automacao_status_travada := false;
    IF NEW.status IN ('Novo', 'sem_resposta', 'Acompanhamento') THEN
      NEW.status := 'Acompanhamento';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_disparo_reset ON public.leads;
CREATE TRIGGER trg_leads_disparo_reset
BEFORE UPDATE OF ultimo_disparo_em ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_leads_disparo_reset();

-- 5. Trigger: nova raia em campanha_proposta_lead_canais destrava automação
CREATE OR REPLACE FUNCTION public.fn_canais_reset_automacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.automacao_sistema', '1', true);
  UPDATE public.leads
     SET automacao_status_travada = false
   WHERE id = NEW.lead_id
     AND automacao_status_travada = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canais_reset_automacao ON public.campanha_proposta_lead_canais;
CREATE TRIGGER trg_canais_reset_automacao
AFTER INSERT ON public.campanha_proposta_lead_canais
FOR EACH ROW
EXECUTE FUNCTION public.fn_canais_reset_automacao();

-- 6. Trigger: mensagem recebida/enviada transiciona para Conversação
CREATE OR REPLACE FUNCTION public.fn_sigzap_message_automacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_status text;
  v_travada boolean;
BEGIN
  SELECT c.lead_id INTO v_lead_id
    FROM public.sigzap_conversations c
   WHERE c.id = NEW.conversation_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, automacao_status_travada
    INTO v_status, v_travada
    FROM public.leads
   WHERE id = v_lead_id;

  -- Flag de sistema para não travar a automação a si mesma
  PERFORM set_config('app.automacao_sistema', '1', true);

  IF NEW.from_me = false THEN
    -- Lead respondeu
    UPDATE public.leads
       SET ultima_resposta_em = coalesce(NEW.sent_at, now()),
           updated_at = now(),
           status = CASE
             WHEN v_travada = false
              AND status IN ('Acompanhamento', 'sem_resposta', 'Novo')
             THEN 'em_conversa'
             ELSE status
           END
     WHERE id = v_lead_id;
  ELSE
    -- Mensagem enviada pelo operador manualmente (sent_by_user_id preenchido)
    IF NEW.sent_by_user_id IS NOT NULL
       AND v_travada = false
       AND v_status IN ('Acompanhamento', 'sem_resposta') THEN
      UPDATE public.leads
         SET status = 'em_conversa',
             updated_at = now()
       WHERE id = v_lead_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sigzap_message_automacao ON public.sigzap_messages;
CREATE TRIGGER trg_sigzap_message_automacao
AFTER INSERT ON public.sigzap_messages
FOR EACH ROW
EXECUTE FUNCTION public.fn_sigzap_message_automacao();

-- 7. Função de sweeper 24h — Acompanhamento → sem_resposta
CREATE OR REPLACE FUNCTION public.sweeper_acompanhamento_sem_resposta()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('app.automacao_sistema', '1', true);

  WITH alvo AS (
    SELECT id
      FROM public.leads
     WHERE status = 'Acompanhamento'
       AND automacao_status_travada = false
       AND ultimo_disparo_em IS NOT NULL
       AND ultimo_disparo_em < now() - interval '24 hours'
       AND (ultima_resposta_em IS NULL OR ultima_resposta_em < ultimo_disparo_em)
  ),
  upd AS (
    UPDATE public.leads l
       SET status = 'sem_resposta',
           updated_at = now()
      FROM alvo
     WHERE l.id = alvo.id
     RETURNING l.id
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$$;

-- 8. Backfill ultima_resposta_em a partir do histórico
UPDATE public.leads l
   SET ultima_resposta_em = sub.ult
  FROM (
    SELECT c.lead_id, max(m.sent_at) AS ult
      FROM public.sigzap_messages m
      JOIN public.sigzap_conversations c ON c.id = m.conversation_id
     WHERE m.from_me = false
       AND c.lead_id IS NOT NULL
     GROUP BY c.lead_id
  ) sub
 WHERE l.id = sub.lead_id
   AND (l.ultima_resposta_em IS NULL OR l.ultima_resposta_em < sub.ult);
