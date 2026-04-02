-- Remover constraint antiga de status
ALTER TABLE public.proposta DROP CONSTRAINT IF EXISTS proposta_status_check;

-- Adicionar nova constraint incluindo 'personalizada'
ALTER TABLE public.proposta ADD CONSTRAINT proposta_status_check 
CHECK (status IN ('rascunho', 'enviada', 'aceita', 'recusada', 'cancelada', 'personalizada'));

-- Atualizar propostas personalizadas existentes
UPDATE public.proposta 
SET status = 'personalizada' 
WHERE tipo = 'personalizada' AND status = 'rascunho';