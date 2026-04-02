-- Adicionar campo para customização de dias de aviso de vencimento
ALTER TABLE public.contratos 
ADD COLUMN dias_aviso_vencimento integer DEFAULT 60 CHECK (dias_aviso_vencimento >= 30 AND dias_aviso_vencimento <= 60);

COMMENT ON COLUMN public.contratos.dias_aviso_vencimento IS 'Número de dias antes do vencimento para começar a exibir alertas (entre 30 e 60 dias)';