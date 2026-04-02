
-- Update comentarios SELECT policy to include externos
DROP POLICY IF EXISTS "Users can view comments on their tickets" ON public.suporte_comentarios;

CREATE POLICY "Users can view comments on their tickets"
ON public.suporte_comentarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM suporte_tickets
    WHERE suporte_tickets.id = suporte_comentarios.ticket_id
    AND (
      suporte_tickets.solicitante_id = auth.uid()
      OR is_admin(auth.uid())
      OR is_leader(auth.uid())
      OR (
        has_role(auth.uid(), 'externos')
        AND (suporte_tickets.responsavel_ti_id IS NULL OR suporte_tickets.responsavel_ti_id = auth.uid())
      )
    )
  )
);
