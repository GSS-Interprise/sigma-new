-- Adicionar coluna tipo na tabela proposta para diferenciar propostas de disparo vs personalizadas
ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'disparo' 
CHECK (tipo IN ('disparo', 'personalizada'));

-- Adicionar coluna nome para identificar a proposta
ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS nome TEXT;

-- Atualizar propostas existentes com lead_id e sem servico_id como personalizadas
UPDATE public.proposta 
SET tipo = 'personalizada' 
WHERE lead_id IS NOT NULL 
  AND servico_id IS NULL 
  AND contrato_id IS NOT NULL 
  AND descricao LIKE '%Proposta para%';

-- Comentários para documentação
COMMENT ON COLUMN public.proposta.tipo IS 'Tipo da proposta: disparo (para campanhas de captação) ou personalizada (indicação direta com valor exclusivo)';
COMMENT ON COLUMN public.proposta.nome IS 'Nome identificador da proposta';