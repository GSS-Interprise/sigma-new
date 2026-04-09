
-- Add ultimo_disparo_em to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS ultimo_disparo_em TIMESTAMPTZ;

-- Add numero_proposta to proposta table
ALTER TABLE public.proposta ADD COLUMN IF NOT EXISTS numero_proposta INTEGER DEFAULT 1;
