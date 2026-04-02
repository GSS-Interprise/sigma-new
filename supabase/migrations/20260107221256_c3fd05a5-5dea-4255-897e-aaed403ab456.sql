-- Adicionar coluna cidade na tabela leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cidade TEXT;