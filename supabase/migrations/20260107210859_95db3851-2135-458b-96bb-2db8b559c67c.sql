-- Permitir licitacao_id nulo para cards criados manualmente
ALTER TABLE public.contrato_rascunho ALTER COLUMN licitacao_id DROP NOT NULL;