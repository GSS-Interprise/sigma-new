-- Atualizar constraint para incluir 'geral'
ALTER TABLE public.proposta DROP CONSTRAINT IF EXISTS proposta_status_check;
ALTER TABLE public.proposta ADD CONSTRAINT proposta_status_check 
CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada', 'cancelada', 'personalizada', 'geral', 'ativa'));

-- Atualizar propostas de disparo existentes de 'rascunho' para 'geral'
UPDATE public.proposta 
SET status = 'geral' 
WHERE (tipo = 'disparo' OR tipo IS NULL) 
  AND status = 'rascunho'
  AND lead_id IS NULL;