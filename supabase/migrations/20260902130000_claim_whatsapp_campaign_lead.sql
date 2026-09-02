-- Reserva um único lead antes da chamada ao provedor. O lock por campanha não
-- basta quando scheduler e self-invoke se sobrepõem no mesmo intervalo.
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
