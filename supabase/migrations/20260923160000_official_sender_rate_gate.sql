-- Share one conservative send slot across every campaign using the same
-- official number. The lease prevents parallel Edge Function workers from
-- racing between campaigns; provider Retry-After extends a sender cooldown.
CREATE TABLE IF NOT EXISTS public.whatsapp_official_sender_rate_limits (
  sender_id uuid PRIMARY KEY REFERENCES public.whatsapp_official_senders(id) ON DELETE CASCADE,
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_official_sender_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_official_sender_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.whatsapp_official_sender_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_whatsapp_official_sender_send(
  p_sender_id uuid,
  p_min_gap_ms integer DEFAULT 3500,
  p_lease_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.whatsapp_official_sender_rate_limits%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_available_at timestamptz;
  v_token uuid;
BEGIN
  IF p_sender_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'sender_required');
  END IF;

  INSERT INTO public.whatsapp_official_sender_rate_limits(sender_id)
  VALUES (p_sender_id)
  ON CONFLICT (sender_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.whatsapp_official_sender_rate_limits
  WHERE sender_id = p_sender_id
  FOR UPDATE;

  v_available_at := greatest(
    coalesce(v_row.next_allowed_at, v_now),
    coalesce(v_row.blocked_until, v_now),
    coalesce(v_row.lease_until, v_now)
  );
  IF v_available_at > v_now THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_ms', greatest(1, ceil(extract(epoch FROM (v_available_at - v_now)) * 1000)::integer),
      'reason', CASE
        WHEN v_row.lease_until > v_now THEN 'sender_in_flight'
        WHEN v_row.blocked_until > v_now THEN 'provider_cooldown'
        ELSE 'sender_minimum_gap'
      END
    );
  END IF;

  v_token := gen_random_uuid();
  UPDATE public.whatsapp_official_sender_rate_limits
  SET lease_token = v_token,
      lease_until = v_now + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 45), 180))),
      next_allowed_at = v_now + make_interval(secs => greatest(1000, least(coalesce(p_min_gap_ms, 3500), 60000)) / 1000.0),
      updated_at = v_now
  WHERE sender_id = p_sender_id;

  RETURN jsonb_build_object('allowed', true, 'lease_token', v_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_whatsapp_official_sender_send(
  p_sender_id uuid,
  p_lease_token uuid,
  p_provider_cooldown_ms integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cooldown_ms integer := greatest(0, least(coalesce(p_provider_cooldown_ms, 0), 21600000));
BEGIN
  UPDATE public.whatsapp_official_sender_rate_limits
  SET lease_token = NULL,
      lease_until = NULL,
      blocked_until = CASE
        WHEN v_cooldown_ms > 0 THEN greatest(blocked_until, clock_timestamp() + make_interval(secs => v_cooldown_ms / 1000.0))
        ELSE blocked_until
      END,
      updated_at = clock_timestamp()
  WHERE sender_id = p_sender_id
    AND lease_token = p_lease_token;
  RETURN FOUND;
END;
$$;

-- A throttle is not a delivery failure. Undo the queue reservation and put
-- the same lead back into retry_wait without spending its retry budget.
CREATE OR REPLACE FUNCTION public.defer_whatsapp_campaign_send(
  p_campanha_lead_id uuid,
  p_retry_after_ms integer DEFAULT 60000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.campanha_leads%ROWTYPE;
  v_delay_ms integer := greatest(1000, least(coalesce(p_retry_after_ms, 60000), 21600000));
BEGIN
  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_lead_not_found');
  END IF;
  IF v_lead.envio_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'action', 'already_reconciled');
  END IF;

  UPDATE public.campanhas
  SET disparos_enviados = greatest(coalesce(disparos_enviados, 0) - 1, 0),
      updated_at = now()
  WHERE id = v_lead.campanha_id;

  UPDATE public.campanha_leads
  SET envio_status = 'retry_wait',
      next_retry_at = clock_timestamp() + make_interval(secs => v_delay_ms / 1000.0),
      erro_envio = NULL,
      ultimo_erro_codigo = NULL,
      ultimo_erro_mensagem = NULL,
      data_status = now(),
      updated_at = now()
  WHERE id = v_lead.id;

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'deferred_without_failure',
    'retry_after_ms', v_delay_ms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_whatsapp_official_sender_send(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_whatsapp_official_sender_send(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.defer_whatsapp_campaign_send(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_whatsapp_official_sender_send(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_whatsapp_official_sender_send(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_whatsapp_campaign_send(uuid, integer) TO service_role;
