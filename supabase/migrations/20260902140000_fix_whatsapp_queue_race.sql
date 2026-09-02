-- Evita que o update pós-envio sobrescreva uma falha já recebida pelo
-- webhook. Quando a confirmação chega primeiro, ela também tira o lead da
-- fila, garantindo que a próxima execução não o selecione novamente.
CREATE OR REPLACE FUNCTION public.reconcile_whatsapp_delivery(
  p_campanha_lead_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead campanha_leads%ROWTYPE;
  v_status text := lower(coalesce(p_status, ''));
  v_code text := nullif(trim(p_error_code), '');
  v_message text := nullif(trim(p_error_message), '');
  v_retryable boolean := false;
  v_next timestamptz;
  v_was_counted boolean;
  v_new_status text;
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

  v_retryable := v_code IS DISTINCT FROM '131026'
    AND coalesce(v_lead.retry_count, 0) < 3;
  IF v_retryable THEN
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
      retry_count = coalesce(retry_count, 0) + 1,
      next_retry_at = v_next,
      ultimo_erro_codigo = v_code,
      ultimo_erro_mensagem = v_message,
      erro_envio = coalesce(v_code || ' · ' || v_message, 'Falha no provedor de WhatsApp'),
      status = CASE WHEN v_retryable THEN 'frio'::status_lead_campanha
                    WHEN v_code = '131026' THEN 'sem_whatsapp'::status_lead_campanha
                    ELSE status END,
      data_primeiro_contato = CASE WHEN v_retryable THEN NULL ELSE data_primeiro_contato END,
      data_ultimo_contato = CASE WHEN v_retryable THEN NULL ELSE data_ultimo_contato END,
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
$$;

REVOKE ALL ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) TO service_role;

-- Corrige leads que ficaram contatados apesar de uma falha 131042 já
-- registrada no histórico. Eles voltam à fila sem gerar novo disparo agora.
UPDATE public.campanha_leads AS cl
SET status = 'frio'::status_lead_campanha,
    data_primeiro_contato = NULL,
    data_ultimo_contato = NULL,
    updated_at = now()
WHERE cl.envio_status = 'retry_wait'
  AND cl.ultimo_erro_codigo IS NOT NULL
  AND cl.status = 'contatado';
