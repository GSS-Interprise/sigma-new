-- Drop the existing INSERT policy
DROP POLICY "Users can create comments on their tickets" ON public.suporte_comentarios;

-- Recreate with support for 'externos' role
CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = autor_id
  AND (
    EXISTS (
      SELECT 1 FROM suporte_tickets
      WHERE suporte_tickets.id = suporte_comentarios.ticket_id
      AND (
        suporte_tickets.solicitante_id = auth.uid()
        OR is_admin(auth.uid())
        OR has_role(auth.uid(), 'externos')
      )
    )
    OR auth.role() = 'service_role'
  )
);
