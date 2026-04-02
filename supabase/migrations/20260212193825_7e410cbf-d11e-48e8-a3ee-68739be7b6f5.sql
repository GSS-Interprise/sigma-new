-- Adicionar campo de data de validade nos anexos de leads
ALTER TABLE public.lead_anexos ADD COLUMN data_validade DATE DEFAULT NULL;
