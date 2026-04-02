-- Adicionar coluna para múltiplas unidades nos contratos AGES
-- Mantém a coluna ages_unidade_id existente para retrocompatibilidade e migração
ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS ages_unidades_ids UUID[] DEFAULT '{}';

-- Migrar dados existentes: copiar ages_unidade_id para o array ages_unidades_ids
UPDATE public.ages_contratos 
SET ages_unidades_ids = ARRAY[ages_unidade_id]
WHERE ages_unidade_id IS NOT NULL 
  AND (ages_unidades_ids IS NULL OR ages_unidades_ids = '{}');

-- Comentário explicativo
COMMENT ON COLUMN public.ages_contratos.ages_unidades_ids IS 'Array de IDs das unidades vinculadas ao contrato (suporta múltiplas unidades)';