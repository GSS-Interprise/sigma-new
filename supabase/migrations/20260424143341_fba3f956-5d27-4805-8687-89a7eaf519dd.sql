
-- Helper: insere um evento na timeline do lead descrevendo a mudança de status
CREATE OR REPLACE FUNCTION public.fn_log_status_change(
  p_lead_id uuid,
  p_status_anterior text,
  p_status_novo text,
  p_origem text,
  p_motivo text,
  p_metadados jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_nome text;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT nome_completo INTO v_user_nome FROM public.profiles WHERE id = v_user_id;
  END IF;

  INSERT INTO public.lead_historico (
    lead_id, tipo_evento, descricao_resumida, metadados, usuario_id, usuario_nome
  ) VALUES (
    p_lead_id,
    'status_alterado'::tipo_evento_lead,
    p_motivo,
    jsonb_build_object(
      'origem', p_origem,
      'motivo', p_motivo,
      'status_anterior', p_status_anterior,
      'status_novo', p_status_novo,
      'automacao_kanban', true
    ) || coalesce(p_metadados, '{}'::jsonb),
    v_user_id,
    v_user_nome
  );
END;
$$;

-- Atualiza trigger de disparo para logar
CREATE OR REPLACE FUNCTION public.fn_leads_disparo_reset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_anterior text := OLD.status;
  v_vai_mudar boolean := false;
BEGIN
  IF NEW.ultimo_disparo_em IS DISTINCT FROM OLD.ultimo_disparo_em
     AND NEW.ultimo_disparo_em IS NOT NULL THEN
    NEW.automacao_status_travada := false;
    IF NEW.status IN ('Novo', 'sem_resposta', 'Acompanhamento')
       AND NEW.status <> 'Acompanhamento' THEN
      v_vai_mudar := true;
      NEW.status := 'Acompanhamento';
    END IF;
  END IF;

  IF v_vai_mudar THEN
    PERFORM public.fn_log_status_change(
      NEW.id,
      v_status_anterior,
      'Acompanhamento',
      'sistema',
      'Disparo registrado — lead movido para Contatados',
      jsonb_build_object('ultimo_disparo_em', NEW.ultimo_disparo_em)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Atualiza trigger de mensagens para logar resposta / envio manual
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

  PERFORM set_config('app.automacao_sistema', '1', true);

  IF NEW.from_me = false THEN
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

    IF v_travada = false AND v_status IN ('Acompanhamento', 'sem_resposta', 'Novo') THEN
      PERFORM public.fn_log_status_change(
        v_lead_id,
        v_status,
        'em_conversa',
        'sistema',
        'Lead respondeu no WhatsApp — movido para Conversação',
        jsonb_build_object(
          'mensagem_preview', left(coalesce(NEW.message_text, ''), 140),
          'sigzap_message_id', NEW.id
        )
      );
    END IF;
  ELSE
    IF NEW.sent_by_user_id IS NOT NULL
       AND v_travada = false
       AND v_status IN ('Acompanhamento', 'sem_resposta') THEN
      UPDATE public.leads
         SET status = 'em_conversa',
             updated_at = now()
       WHERE id = v_lead_id;

      PERFORM public.fn_log_status_change(
        v_lead_id,
        v_status,
        'em_conversa',
        'operador',
        'Operador enviou mensagem manual — lead movido para Conversação',
        jsonb_build_object(
          'sent_by_user_id', NEW.sent_by_user_id,
          'mensagem_preview', left(coalesce(NEW.message_text, ''), 140)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Atualiza sweeper 24h para logar cada transição
CREATE OR REPLACE FUNCTION public.sweeper_acompanhamento_sem_resposta()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  PERFORM set_config('app.automacao_sistema', '1', true);

  FOR v_row IN
    SELECT id, ultimo_disparo_em, ultima_resposta_em
      FROM public.leads
     WHERE status = 'Acompanhamento'
       AND automacao_status_travada = false
       AND ultimo_disparo_em IS NOT NULL
       AND ultimo_disparo_em < now() - interval '24 hours'
       AND (ultima_resposta_em IS NULL OR ultima_resposta_em < ultimo_disparo_em)
  LOOP
    UPDATE public.leads
       SET status = 'sem_resposta', updated_at = now()
     WHERE id = v_row.id;

    PERFORM public.fn_log_status_change(
      v_row.id,
      'Acompanhamento',
      'sem_resposta',
      'sistema',
      'Sem resposta há mais de 24h desde o último disparo',
      jsonb_build_object(
        'ultimo_disparo_em', v_row.ultimo_disparo_em,
        'ultima_resposta_em', v_row.ultima_resposta_em
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Trigger AFTER UPDATE para registrar movimentações manuais do operador
CREATE OR REPLACE FUNCTION public.fn_leads_status_manual_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.automacao_sistema', true), '') <> '1' THEN
    PERFORM public.fn_log_status_change(
      NEW.id,
      OLD.status,
      NEW.status,
      'usuario',
      'Operador moveu o lead manualmente para ' || NEW.status,
      jsonb_build_object('acao', 'drag_and_drop_kanban')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_manual_log ON public.leads;
CREATE TRIGGER trg_leads_status_manual_log
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.fn_leads_status_manual_log();
