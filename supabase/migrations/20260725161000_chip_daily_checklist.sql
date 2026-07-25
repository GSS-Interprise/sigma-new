-- Rotina diária dos chips dentro do Sigma.
-- A fotografia diária preserva quem verificou e o resultado observado, evitando
-- que a operação volte a depender de planilha, post-it ou memória.

CREATE TABLE IF NOT EXISTS public.chip_daily_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  device_available boolean NOT NULL,
  battery_ok boolean NOT NULL,
  signal_ok boolean NOT NULL,
  whatsapp_ok boolean NOT NULL,
  evolution_ok boolean NOT NULL,
  send_receive_test_ok boolean NOT NULL,
  notes text,
  checked_by uuid NOT NULL DEFAULT auth.uid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chip_id, check_date)
);

CREATE INDEX IF NOT EXISTS idx_chip_daily_checks_date
  ON public.chip_daily_checks (check_date DESC, chip_id);

ALTER TABLE public.chip_daily_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_chip_daily_checks"
  ON public.chip_daily_checks FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_chip_daily_checks"
  ON public.chip_daily_checks FOR INSERT TO authenticated
  WITH CHECK (checked_by = auth.uid());

CREATE POLICY "checker_or_admin_update_chip_daily_checks"
  ON public.chip_daily_checks FOR UPDATE TO authenticated
  USING (checked_by = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (checked_by = auth.uid() OR public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.chip_daily_checks TO authenticated;
GRANT ALL ON public.chip_daily_checks TO service_role;

CREATE OR REPLACE FUNCTION public.save_chip_daily_check(
  p_chip_id uuid,
  p_device_available boolean,
  p_battery_ok boolean,
  p_signal_ok boolean,
  p_whatsapp_ok boolean,
  p_evolution_ok boolean,
  p_send_receive_test_ok boolean,
  p_notes text DEFAULT NULL
)
RETURNS public.chip_daily_checks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result public.chip_daily_checks;
BEGIN
  INSERT INTO public.chip_daily_checks (
    chip_id,
    device_available,
    battery_ok,
    signal_ok,
    whatsapp_ok,
    evolution_ok,
    send_receive_test_ok,
    notes,
    checked_by
  )
  VALUES (
    p_chip_id,
    p_device_available,
    p_battery_ok,
    p_signal_ok,
    p_whatsapp_ok,
    p_evolution_ok,
    p_send_receive_test_ok,
    nullif(btrim(p_notes), ''),
    auth.uid()
  )
  ON CONFLICT (chip_id, check_date) DO UPDATE SET
    device_available = EXCLUDED.device_available,
    battery_ok = EXCLUDED.battery_ok,
    signal_ok = EXCLUDED.signal_ok,
    whatsapp_ok = EXCLUDED.whatsapp_ok,
    evolution_ok = EXCLUDED.evolution_ok,
    send_receive_test_ok = EXCLUDED.send_receive_test_ok,
    notes = EXCLUDED.notes,
    checked_by = auth.uid(),
    checked_at = now(),
    updated_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_chip_daily_check(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean, text
) TO authenticated;

CREATE OR REPLACE VIEW public.vw_chip_daily_check_status
WITH (security_invoker = true)
AS
SELECT
  c.id AS chip_id,
  c.nome AS chip_nome,
  d.id AS check_id,
  d.checked_at,
  d.checked_by,
  d.device_available,
  d.battery_ok,
  d.signal_ok,
  d.whatsapp_ok,
  d.evolution_ok,
  d.send_receive_test_ok,
  coalesce(
    d.device_available
    AND d.battery_ok
    AND d.signal_ok
    AND d.whatsapp_ok
    AND d.evolution_ok
    AND d.send_receive_test_ok,
    false
  ) AS all_ok,
  d.notes
FROM public.chips c
LEFT JOIN public.chip_daily_checks d
  ON d.chip_id = c.id
 AND d.check_date = CURRENT_DATE;

GRANT SELECT ON public.vw_chip_daily_check_status TO authenticated;
GRANT SELECT ON public.vw_chip_daily_check_status TO service_role;

COMMENT ON TABLE public.chip_daily_checks IS
  'Checklist operacional diário por chip, com responsável e fotografia dos testes.';
