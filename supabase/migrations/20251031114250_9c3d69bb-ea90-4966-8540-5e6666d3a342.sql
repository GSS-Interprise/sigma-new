-- Adicionar campo is_externo à tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios 
ADD COLUMN IF NOT EXISTS is_externo BOOLEAN DEFAULT false;

-- Adicionar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_suporte_comentarios_ticket_id 
ON public.suporte_comentarios(ticket_id);

CREATE INDEX IF NOT EXISTS idx_suporte_comentarios_created_at 
ON public.suporte_comentarios(created_at);

-- Comentário explicativo
COMMENT ON COLUMN public.suporte_comentarios.is_externo IS 'Indica se o comentário veio de uma resposta de e-mail externa';