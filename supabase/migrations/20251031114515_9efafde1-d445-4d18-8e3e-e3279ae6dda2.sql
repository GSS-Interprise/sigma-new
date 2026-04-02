-- Adicionar campo autor_email à tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios 
ADD COLUMN IF NOT EXISTS autor_email TEXT;

-- Tornar autor_id nullable para permitir comentários de emails externos
ALTER TABLE public.suporte_comentarios 
ALTER COLUMN autor_id DROP NOT NULL;

-- Atualizar RLS policies para permitir inserção de comentários externos (via edge function)
DROP POLICY IF EXISTS "Users can create comments on their tickets" ON public.suporte_comentarios;

CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
WITH CHECK (
  (auth.uid() = autor_id AND EXISTS (
    SELECT 1 FROM suporte_tickets
    WHERE suporte_tickets.id = suporte_comentarios.ticket_id
    AND (suporte_tickets.solicitante_id = auth.uid() OR is_admin(auth.uid()))
  ))
  OR
  -- Permitir inserção via service role (edge functions) para comentários externos
  auth.role() = 'service_role'
);

-- Comentários
COMMENT ON COLUMN public.suporte_comentarios.autor_email IS 'Email do autor do comentário (usado para comentários externos)';