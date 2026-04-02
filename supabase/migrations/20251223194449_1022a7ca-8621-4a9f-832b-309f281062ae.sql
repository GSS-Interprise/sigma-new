-- Adicionar coluna para ignorar pendências
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS ignorada BOOLEAN DEFAULT false;

-- Adicionar coluna para motivo da ignorância
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS motivo_ignorar TEXT;