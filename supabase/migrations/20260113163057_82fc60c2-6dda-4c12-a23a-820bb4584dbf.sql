-- Adicionar campo etiquetas na tabela medico_kanban_cards
ALTER TABLE public.medico_kanban_cards
ADD COLUMN etiquetas text[] DEFAULT '{}';

-- Criar índice para busca por etiquetas
CREATE INDEX idx_medico_kanban_cards_etiquetas ON public.medico_kanban_cards USING GIN(etiquetas);