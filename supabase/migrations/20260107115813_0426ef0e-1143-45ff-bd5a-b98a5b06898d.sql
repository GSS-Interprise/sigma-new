-- Add missing contract field used by the UI
ALTER TABLE public.ages_contratos
ADD COLUMN IF NOT EXISTS tipo_servico TEXT[];