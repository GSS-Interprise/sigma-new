-- Adicionar campos para rastrear envio de emails na tabela suporte_tickets
ALTER TABLE public.suporte_tickets
ADD COLUMN email_enviado_em timestamp with time zone,
ADD COLUMN email_status text DEFAULT 'pendente' CHECK (email_status IN ('pendente', 'enviado', 'falha')),
ADD COLUMN email_erro text;