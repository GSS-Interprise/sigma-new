-- Add new fields to servico table
ALTER TABLE public.servico 
ADD COLUMN IF NOT EXISTS especialidade text,
ADD COLUMN IF NOT EXISTS lista_servicos text[] DEFAULT '{}';