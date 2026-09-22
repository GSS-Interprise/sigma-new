-- Serialize the daily campaign quota with the lead claim. The burst preflight
-- remains useful for reporting, but this function is the final concurrency guard.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_campaign_send(
  p_campanha_lead_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead campanha_leads%ROWTYPE;
  v_limit integer;
  v_provider text;
  v_day_start timestamptz;
  v_used integer;
BEGIN
  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_lead.status <> 'frio'::status_lead_campanha
     OR v_lead.envio_status NOT IN ('not_sent', 'retry_wait')
     OR (v_lead.next_retry_at IS NOT NULL AND v_lead.next_retry_at > now())
  THEN
    RETURN false;
  END IF;

  -- The campaign row is the serialization point for all workers of the same
  -- campaign, including the recurring processor and a controlled burst.
  SELECT whatsapp_provider, limite_diario_campanha
    INTO v_provider, v_limit
  FROM public.campanhas
  WHERE id = v_lead.campanha_id
  FOR UPDATE;
  v_limit := CASE
    WHEN v_provider IN ('twilio', 'chakra') THEN coalesce(v_limit, 250)
    ELSE coalesce(v_limit, 30)
  END;

  IF v_limit <= 0 THEN
    RETURN false;
  END IF;

  v_day_start := (
      date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
      AT TIME ZONE 'America/Sao_Paulo'
    );

    SELECT count(*) INTO v_used
    FROM public.campanha_leads
    WHERE campanha_id = v_lead.campanha_id
      AND (
        data_primeiro_contato >= v_day_start
        OR (envio_status = 'pending' AND data_status >= v_day_start)
      );

    IF v_used >= v_limit THEN
      RETURN false;
    END IF;

  UPDATE public.campanhas
  SET disparos_enviados = coalesce(disparos_enviados, 0) + 1,
      updated_at = now()
  WHERE id = v_lead.campanha_id;

  UPDATE public.campanha_leads
  SET envio_status = 'pending',
      next_retry_at = NULL,
      erro_envio = NULL,
      data_status = now(),
      updated_at = now()
  WHERE id = v_lead.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_campaign_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_campaign_send(uuid) TO service_role;
