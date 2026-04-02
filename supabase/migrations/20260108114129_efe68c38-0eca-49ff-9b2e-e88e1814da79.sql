-- Adicionar campo ativo na tabela disparos_campanhas
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Criar índice para filtro de ativos
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_ativo ON public.disparos_campanhas(ativo);