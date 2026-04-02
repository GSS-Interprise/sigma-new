-- Adicionar campo para dados customizados nas licitações
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS dados_customizados JSONB DEFAULT '{}'::jsonb;