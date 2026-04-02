-- Adiciona coluna para capturar o canal de conversão do lead para médico
-- Isso permite BI sobre como os leads foram efetivamente captados/convertidos

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS canal_conversao TEXT;

-- Adiciona comentário para documentação
COMMENT ON COLUMN public.leads.canal_conversao IS 'Canal pelo qual o lead foi efetivamente convertido (WHATSAPP, EMAIL, INDICACAO, TRAFEGO-PAGO, LISTA-CAPTADORA)';