ALTER TABLE public.disparo_listas
ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'manual';

ALTER TABLE public.disparo_listas
DROP CONSTRAINT IF EXISTS disparo_listas_modo_check;

ALTER TABLE public.disparo_listas
ADD CONSTRAINT disparo_listas_modo_check
CHECK (modo IN ('manual', 'dinamica', 'mista'));