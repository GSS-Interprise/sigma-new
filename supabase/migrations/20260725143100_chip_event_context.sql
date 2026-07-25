-- Congela o contexto operacional no momento da transição do chip.
ALTER TABLE public.chip_operational_events
  ADD COLUMN IF NOT EXISTS proxy_assignment_id uuid
    REFERENCES public.chip_proxy_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proxy_provider text,
  ADD COLUMN IF NOT EXISTS provider_proxy_id text,
  ADD COLUMN IF NOT EXISTS campaign_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_chip_operational_events_campaigns
  ON public.chip_operational_events USING gin(campaign_ids);

CREATE OR REPLACE FUNCTION public.trg_log_chip_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proxy public.chip_proxy_assignments%ROWTYPE;
  v_campaign_ids uuid[];
BEGIN
  IF NEW.operational_state IS DISTINCT FROM OLD.operational_state
     OR NEW.restriction_until IS DISTINCT FROM OLD.restriction_until
     OR NEW.operational_note IS DISTINCT FROM OLD.operational_note THEN
    NEW.operational_state_since := now();
    NEW.operational_state_reported_by := coalesce(auth.uid(), NEW.operational_state_reported_by);

    SELECT *
    INTO v_proxy
    FROM public.chip_proxy_assignments
    WHERE chip_id = NEW.id
    LIMIT 1;

    SELECT coalesce(array_agg(c.id ORDER BY c.created_at), '{}'::uuid[])
    INTO v_campaign_ids
    FROM public.campanhas c
    WHERE c.status IN ('ativa', 'pausada')
      AND (
        c.chip_id = NEW.id
        OR c.chip_fallback_id = NEW.id
        OR NEW.id = ANY(coalesce(c.chip_ids, '{}'::uuid[]))
      );

    INSERT INTO public.chip_operational_events(
      chip_id,
      previous_state,
      state,
      connection_state,
      restriction_until,
      note,
      source,
      reported_by,
      proxy_assignment_id,
      proxy_provider,
      provider_proxy_id,
      campaign_ids
    )
    VALUES (
      NEW.id,
      OLD.operational_state,
      NEW.operational_state,
      NEW.connection_state,
      NEW.restriction_until,
      nullif(trim(coalesce(NEW.operational_note, '')), ''),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'operator' END,
      coalesce(auth.uid(), NEW.operational_state_reported_by),
      v_proxy.id,
      v_proxy.provider,
      v_proxy.provider_proxy_id,
      v_campaign_ids
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.chip_operational_events.provider_proxy_id IS
  'Identificador não secreto do proxy dedicado usado no momento do evento.';
COMMENT ON COLUMN public.chip_operational_events.campaign_ids IS
  'Snapshot das campanhas ativas ou pausadas vinculadas ao chip no momento do evento.';
