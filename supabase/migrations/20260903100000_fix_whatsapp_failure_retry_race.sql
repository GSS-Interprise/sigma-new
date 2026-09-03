-- A confirmação síncrona do envio pode chegar depois do webhook de falha.
-- Nunca reabra uma falha já reconciliada como pending: isso alimentava
-- retentativas duplicadas e fazia o card parecer contatado.
CREATE OR REPLACE FUNCTION public.account_whatsapp_campaign_send(
  p_campanha_lead_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead campanha_leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  -- O webhook já resolveu a tentativa. O chamador ainda pode registrar a
  -- mensagem, mas não pode recolocar o lead na fila nem alterar contadores.
  IF v_lead.envio_status IN ('retry_wait', 'failed_permanent') THEN
    RETURN false;
  END IF;

  IF v_lead.envio_status NOT IN ('pending', 'confirmed') THEN
    UPDATE public.campanhas
    SET disparos_enviados = coalesce(disparos_enviados, 0) + 1,
        updated_at = now()
    WHERE id = v_lead.campanha_id;
  END IF;

  UPDATE public.campanha_leads
  SET envio_status = CASE
        WHEN envio_status = 'confirmed' THEN 'confirmed'
        ELSE 'pending'
      END,
      next_retry_at = CASE WHEN envio_status = 'confirmed' THEN next_retry_at ELSE NULL END,
      erro_envio = CASE WHEN envio_status = 'confirmed' THEN erro_envio ELSE NULL END,
      updated_at = now()
  WHERE id = v_lead.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.account_whatsapp_campaign_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_whatsapp_campaign_send(uuid) TO service_role;

-- 131049 é rejeição definitiva daquele contato pela Meta. Repetir a mesma
-- mensagem só cria novas bolhas falhas e aumenta o risco de bloqueio.
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

  v_retryable := coalesce(v_code, '') NOT IN ('131026', '131049')
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
      status = CASE
        WHEN v_retryable THEN 'frio'::status_lead_campanha
        WHEN v_code = '131026' THEN 'sem_whatsapp'::status_lead_campanha
        ELSE 'descartado'::status_lead_campanha
      END,
      -- Uma falha não é primeiro contato. Se uma confirmação chegar depois,
      -- o ramo de sucesso acima preencherá os campos novamente.
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
$$;

REVOKE ALL ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) TO service_role;

-- Corrige estados deixados pela corrida anterior: retry_wait volta à fila;
-- falha permanente sai do funil ativo. Nenhum desses registros é contado como
-- contato confirmado.
UPDATE public.campanha_leads
SET status = CASE
      WHEN envio_status = 'retry_wait' THEN 'frio'::status_lead_campanha
      WHEN ultimo_erro_codigo = '131026' THEN 'sem_whatsapp'::status_lead_campanha
      ELSE 'descartado'::status_lead_campanha
    END,
    data_primeiro_contato = NULL,
    data_ultimo_contato = NULL,
    updated_at = now()
WHERE envio_status IN ('retry_wait', 'failed_permanent')
  AND status = 'contatado'::status_lead_campanha;
