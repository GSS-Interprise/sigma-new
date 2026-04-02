-- Atualizar enum de status_ticket para incluir novos status
ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aberto';
ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_usuario';
ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'em_validacao';

-- Adicionar campo setor_responsavel à tabela suporte_tickets
ALTER TABLE public.suporte_tickets
ADD COLUMN IF NOT EXISTS setor_responsavel text DEFAULT 'TI';

-- Criar índice para melhor performance nas consultas por setor
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_setor_responsavel 
ON public.suporte_tickets(setor_responsavel);

-- Criar índice para melhor performance nas consultas por status
CREATE INDEX IF NOT EXISTS idx_suporte_tickets_status 
ON public.suporte_tickets(status);

COMMENT ON COLUMN public.suporte_tickets.setor_responsavel IS 'Setor responsável pela análise e resolução do ticket. Default: TI para triagem inicial';