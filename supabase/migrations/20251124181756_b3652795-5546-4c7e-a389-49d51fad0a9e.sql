-- Adicionar campos para rastrear quem resolveu o ticket
ALTER TABLE public.suporte_tickets
ADD COLUMN IF NOT EXISTS resolvido_por_id UUID,
ADD COLUMN IF NOT EXISTS resolvido_por_nome TEXT;

-- Adicionar comentário explicativo
COMMENT ON COLUMN public.suporte_tickets.resolvido_por_id IS 'ID do usuário da equipe de suporte que resolveu o ticket';
COMMENT ON COLUMN public.suporte_tickets.resolvido_por_nome IS 'Nome do usuário da equipe de suporte que resolveu o ticket';