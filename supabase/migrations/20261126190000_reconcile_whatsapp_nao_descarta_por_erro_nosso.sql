-- Falha de envio de campanha: não descarta o médico por erro nosso nem por limite temporário da Meta (auditoria 26/11).
CREATE OR REPLACE FUNCTION public.reconcile_whatsapp_delivery(p_campanha_lead_id uuid, p_status text, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead campanha_leads%ROWTYPE;
  v_status text := lower(coalesce(p_status, ''));
  v_code text := nullif(trim(p_error_code), '');
  v_message text := nullif(trim(p_error_message), '');
  v_retryable boolean := false;
  v_next timestamptz;
  v_was_counted boolean;
  v_new_status text;
  v_nosso boolean := false;
BEGIN
  IF p_campanha_lead_id IS NULL OR v_status = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  END IF;

  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_lead_not_found');
  END IF;

  v_was_counted := v_lead.envio_status IN ('pending', 'confirmed');

  IF v_status IN ('sent', 'delivered', 'read', 'accepted') THEN
    UPDATE public.campanha_leads
    SET envio_status = 'confirmed',
        envio_confirmado_at = coalesce(envio_confirmado_at, now()),
        next_retry_at = NULL,
        ultimo_erro_codigo = NULL,
        ultimo_erro_mensagem = NULL,
        erro_envio = NULL,
        status = CASE WHEN status = 'frio'::status_lead_campanha
                      THEN 'contatado'::status_lead_campanha ELSE status END,
        data_primeiro_contato = coalesce(data_primeiro_contato, now()),
        data_ultimo_contato = coalesce(data_ultimo_contato, now()),
        data_status = now(),
        updated_at = now()
    WHERE id = v_lead.id;
    RETURN jsonb_build_object('ok', true, 'action', 'confirmed');
  END IF;

  IF v_status NOT IN ('failed', 'undelivered', 'error') THEN
    RETURN jsonb_build_object('ok', true, 'action', 'ignored');
  END IF;

  -- Auditoria de 26/11: ~620 médicos foram descartados por motivo que não era deles.
  -- Problema NOSSO (conta travada 131031, pagamento 131042, ritmo para o mesmo número 131056): o médico volta para a
  -- fila sem gastar tentativa, em 2 h (o disparo tira da rodada o número que o monitor marcou como Não usar).
  -- Limite do DESTINATÁRIO (131049 = limite de marketing por pessoa, 24 h; 130472 = experimento da Meta): tenta de
  -- novo depois de 26 h / 7 dias, até 2 vezes. Só 131026 (sem WhatsApp) e os demais esgotados descartam.
  v_nosso := coalesce(v_code, '') IN ('131031', '131042', '131056');
  IF v_nosso THEN
    v_retryable := true;
    v_next := now() + interval '2 hours';
    v_new_status := 'retry_wait';
  ELSIF coalesce(v_code, '') IN ('131049', '130472') AND coalesce(v_lead.retry_count, 0) < 2 THEN
    v_retryable := true;
    v_next := now() + CASE WHEN v_code = '131049' THEN interval '26 hours' ELSE interval '7 days' END;
    v_new_status := 'retry_wait';
  ELSIF coalesce(v_code, '') NOT IN ('130472', '131026', '131049') AND coalesce(v_lead.retry_count, 0) < 3 THEN
    v_retryable := true;
    v_next := now() + make_interval(mins => least(60, 15 * greatest(coalesce(v_lead.retry_count, 0), 1)));
    v_new_status := 'retry_wait';
  ELSE
    v_next := NULL;
    v_new_status := 'failed_permanent';
  END IF;

  IF v_was_counted THEN
    UPDATE public.campanhas
    SET disparos_enviados = greatest(coalesce(disparos_enviados, 0) - 1, 0),
        disparos_falhas = coalesce(disparos_falhas, 0) + 1,
        updated_at = now()
    WHERE id = v_lead.campanha_id;
  END IF;

  UPDATE public.campanha_leads
  SET envio_status = v_new_status,
      retry_count = coalesce(retry_count, 0) + CASE WHEN v_nosso THEN 0 ELSE 1 END,
      next_retry_at = v_next,
      ultimo_erro_codigo = v_code,
      ultimo_erro_mensagem = v_message,
      erro_envio = coalesce(v_code || ' · ' || v_message, 'Falha no provedor de WhatsApp'),
      status = CASE
        WHEN v_retryable THEN 'frio'::status_lead_campanha
        WHEN v_code = '131026' THEN 'sem_whatsapp'::status_lead_campanha
        ELSE 'descartado'::status_lead_campanha
      END,
      data_primeiro_contato = NULL,
      data_ultimo_contato = NULL,
      envio_confirmado_at = CASE WHEN v_retryable THEN envio_confirmado_at ELSE NULL END,
      data_status = now(),
      updated_at = now()
  WHERE id = v_lead.id;

  RETURN jsonb_build_object(
    'ok', true,
    'action', CASE WHEN v_retryable THEN 'queued_retry' ELSE 'permanent_failure' END,
    'next_retry_at', v_next,
    'code', v_code
  );
END;
$function$;
