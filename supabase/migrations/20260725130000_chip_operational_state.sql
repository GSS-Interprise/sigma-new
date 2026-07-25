-- Estado operacional informado pela equipe complementa o socket da Evolution.
-- "close" sozinho não distingue restrição Web, banimento, bateria ou QR com erro.

ALTER TABLE public.chips
  ADD COLUMN IF NOT EXISTS operational_state text NOT NULL DEFAULT 'unknown'
    CHECK (operational_state IN (
      'unknown',
      'operational',
      'disconnected',
      'restricted_web',
      'restricted_new_chats',
      'restricted_temporary',
      'banned',
      'device_unavailable',
      'qr_error'
    )),
  ADD COLUMN IF NOT EXISTS operational_state_since timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_until timestamptz,
  ADD COLUMN IF NOT EXISTS operational_note text,
  ADD COLUMN IF NOT EXISTS operational_state_reported_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.chip_operational_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  previous_state text,
  state text NOT NULL,
  connection_state text,
  restriction_until timestamptz,
  note text,
  source text NOT NULL DEFAULT 'operator'
    CHECK (source IN ('operator', 'evolution', 'healthcheck', 'system')),
  reported_by uuid REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chip_operational_events_chip_time
  ON public.chip_operational_events(chip_id, occurred_at DESC);

ALTER TABLE public.chip_operational_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chip_operational_events_select ON public.chip_operational_events;
CREATE POLICY chip_operational_events_select
  ON public.chip_operational_events
  FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.chip_operational_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chip_operational_events TO authenticated;
GRANT ALL ON public.chip_operational_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.chip_operational_events_id_seq
  TO service_role;

CREATE OR REPLACE FUNCTION public.trg_log_chip_operational_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.operational_state IS DISTINCT FROM OLD.operational_state
     OR NEW.restriction_until IS DISTINCT FROM OLD.restriction_until
     OR NEW.operational_note IS DISTINCT FROM OLD.operational_note THEN
    NEW.operational_state_since := now();
    NEW.operational_state_reported_by := coalesce(auth.uid(), NEW.operational_state_reported_by);

    INSERT INTO public.chip_operational_events(
      chip_id,
      previous_state,
      state,
      connection_state,
      restriction_until,
      note,
      source,
      reported_by
    )
    VALUES (
      NEW.id,
      OLD.operational_state,
      NEW.operational_state,
      NEW.connection_state,
      NEW.restriction_until,
      nullif(trim(coalesce(NEW.operational_note, '')), ''),
      CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'operator' END,
      coalesce(auth.uid(), NEW.operational_state_reported_by)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_chip_operational_state ON public.chips;
CREATE TRIGGER trg_log_chip_operational_state
BEFORE UPDATE OF operational_state, restriction_until, operational_note
ON public.chips
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_chip_operational_state();

-- Estado inicial inferido sem fingir que conhecemos o tipo de restrição.
UPDATE public.chips
SET operational_state = CASE
      WHEN connection_state = 'open' THEN 'operational'
      WHEN connection_state = 'connecting' THEN 'disconnected'
      ELSE 'unknown'
    END,
    operational_state_since = coalesce(updated_at, now())
WHERE operational_state = 'unknown';

CREATE OR REPLACE VIEW public.vw_chip_saude AS
SELECT
  c.id,
  c.nome,
  c.connection_state,
  c.pode_disparar,
  c.categoria_uso,
  c.provedor,
  cs.fase,
  coalesce(c.operational_state_since, c.updated_at) AS estado_desde,
  (
    c.connection_state = 'open'
    AND c.operational_state = 'operational'
    AND cs.fase IN ('pronto', 'producao')
    AND coalesce(c.pode_disparar, false)
  ) AS usavel,
  (
    SELECT max(l.created_at)
    FROM public.chip_auto_reconnect_log l
    WHERE l.chip_id = c.id AND l.action = 'needs_qr'
  ) AS ultima_queda,
  (
    SELECT count(*)
    FROM public.chip_auto_reconnect_log l
    WHERE l.chip_id = c.id
      AND l.action = 'needs_qr'
      AND l.created_at > now() - interval '24 hours'
  ) AS quedas_24h,
  public.chip_health_score(c.id) AS health,
  c.operational_state,
  c.restriction_until,
  c.operational_note,
  c.operational_state_reported_by,
  (
    SELECT count(*)
    FROM public.chip_operational_events e
    WHERE e.chip_id = c.id
      AND e.state LIKE 'restricted%'
      AND e.occurred_at > now() - interval '30 days'
  ) AS restricoes_30d
FROM public.chips c
LEFT JOIN public.chip_state cs ON cs.chip_id = c.id
WHERE c.status = 'ativo';

GRANT SELECT ON public.vw_chip_saude TO authenticated, service_role, anon;

COMMENT ON TABLE public.chip_operational_events IS
  'Linha do tempo de restrições, indisponibilidade e recuperação dos chips.';
