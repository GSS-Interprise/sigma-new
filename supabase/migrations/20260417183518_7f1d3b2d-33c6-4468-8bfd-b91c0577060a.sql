ALTER TABLE public.chips
ADD COLUMN IF NOT EXISTS tipo_instancia text NOT NULL DEFAULT 'disparos';

ALTER TABLE public.chips
DROP CONSTRAINT IF EXISTS chips_tipo_instancia_check;

ALTER TABLE public.chips
ADD CONSTRAINT chips_tipo_instancia_check
CHECK (tipo_instancia IN ('disparos', 'trafego_pago'));

CREATE INDEX IF NOT EXISTS idx_chips_tipo_instancia ON public.chips(tipo_instancia);