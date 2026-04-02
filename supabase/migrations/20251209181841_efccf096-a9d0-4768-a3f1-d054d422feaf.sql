-- Adicionar campo cor à tabela captacao_permissoes_usuario
ALTER TABLE public.captacao_permissoes_usuario 
ADD COLUMN IF NOT EXISTS cor TEXT;