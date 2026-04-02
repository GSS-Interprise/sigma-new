-- Adicionar campo tipo_licitacao para distinguir licitações GSS vs AGES
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS tipo_licitacao TEXT DEFAULT 'GSS' CHECK (tipo_licitacao IN ('GSS', 'AGES'));

-- Criar índice para filtros por tipo
CREATE INDEX IF NOT EXISTS idx_licitacoes_tipo_licitacao ON public.licitacoes(tipo_licitacao);