DROP POLICY "Admins líderes e externos podem atualizar tickets" ON public.suporte_tickets;

CREATE POLICY "Admins líderes e externos podem atualizar tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid()) 
  OR has_role(auth.uid(), 'externos'::app_role)
);