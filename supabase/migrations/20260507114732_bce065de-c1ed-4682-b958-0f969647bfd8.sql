-- Backfill chip_state for chips that don't have one
INSERT INTO public.chip_state (chip_id, fase, fase_inicio_at, aquecedor_ativo)
SELECT c.id, 'producao', now(), false
FROM public.chips c
LEFT JOIN public.chip_state cs ON cs.chip_id = c.id
WHERE cs.chip_id IS NULL;

-- Trigger to auto-create chip_state on new chip
CREATE OR REPLACE FUNCTION public.ensure_chip_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chip_state (chip_id, fase, fase_inicio_at, aquecedor_ativo)
  VALUES (NEW.id, 'novo', now(), false)
  ON CONFLICT (chip_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_chip_state ON public.chips;
CREATE TRIGGER trg_ensure_chip_state
AFTER INSERT ON public.chips
FOR EACH ROW EXECUTE FUNCTION public.ensure_chip_state();