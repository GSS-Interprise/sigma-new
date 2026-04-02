-- Adicionar campo para rastrear última visualização do ticket pelo admin
ALTER TABLE public.suporte_tickets 
ADD COLUMN ultima_visualizacao_admin timestamp with time zone;

COMMENT ON COLUMN public.suporte_tickets.ultima_visualizacao_admin IS 'Última vez que um admin visualizou este ticket (para controlar notificações de novas respostas)';