-- Add prioridade column to licitacoes table
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT NULL;