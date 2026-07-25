-- Contingência quando a equipe precisa operar pelo aparelho.
-- Ao encerrar, a instância volta automaticamente para catch-up de histórico.
CREATE TABLE IF NOT EXISTS public.chip_device_contingencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ended_at timestamptz,
  ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sync_requested_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chip_device_contingency_open
  ON public.chip_device_contingencies(chip_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chip_device_contingency_started
  ON public.chip_device_contingencies(started_at DESC);

ALTER TABLE public.chip_device_contingencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view chip contingencies"
  ON public.chip_device_contingencies;
CREATE POLICY "Authenticated can view chip contingencies"
  ON public.chip_device_contingencies
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON public.chip_device_contingencies
  FROM anon, authenticated;
GRANT SELECT ON public.chip_device_contingencies TO authenticated;
GRANT ALL ON public.chip_device_contingencies TO service_role;

CREATE OR REPLACE FUNCTION public.begin_chip_device_contingency(
  p_chip_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  INSERT INTO public.chip_device_contingencies(
    chip_id, reason, notes, started_by
  )
  VALUES (
    p_chip_id, btrim(p_reason), nullif(btrim(p_notes), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  UPDATE public.chips
  SET
    operational_state = 'device_unavailable',
    operational_note = concat('Contingência no aparelho: ', btrim(p_reason))
  WHERE id = p_chip_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_chip_device_contingency(
  p_contingency_id uuid,
  p_notes text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chip_id uuid;
  v_jobs integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  UPDATE public.chip_device_contingencies
  SET
    ended_at = now(),
    ended_by = auth.uid(),
    sync_requested_at = now(),
    notes = COALESCE(nullif(btrim(p_notes), ''), notes)
  WHERE id = p_contingency_id
    AND ended_at IS NULL
  RETURNING chip_id INTO v_chip_id;

  IF v_chip_id IS NULL THEN
    RAISE EXCEPTION 'open_contingency_not_found';
  END IF;

  INSERT INTO public.sigzap_history_sync_jobs(
    instance_id, cursor_page, status, next_run_at, last_error, updated_at
  )
  SELECT id, 1, 'catchup', now(), NULL, now()
  FROM public.sigzap_instances
  WHERE chip_id = v_chip_id
  ON CONFLICT (instance_id) DO UPDATE
  SET
    cursor_page = 1,
    status = 'catchup',
    next_run_at = now(),
    last_error = NULL,
    updated_at = now();

  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  UPDATE public.chips
  SET
    operational_state = CASE
      WHEN connection_state = 'open' THEN 'operational'
      ELSE 'disconnected'
    END,
    operational_note = CASE
      WHEN v_jobs > 0 THEN 'Contingência encerrada; sincronização de histórico solicitada.'
      ELSE 'Contingência encerrada; instância sem job de sincronização.'
    END
  WHERE id = v_chip_id;

  RETURN v_jobs;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_chip_device_contingency(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_chip_device_contingency(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_chip_device_contingency(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_chip_device_contingency(uuid, text)
  TO authenticated, service_role;

COMMENT ON TABLE public.chip_device_contingencies IS
  'Janelas auditáveis em que a operação ocorreu diretamente no aparelho; o encerramento agenda catch-up do histórico.';
