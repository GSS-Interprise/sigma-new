-- Remover políticas duplicadas de INSERT
DROP POLICY IF EXISTS "Users can create tickets" ON public.suporte_tickets;
DROP POLICY IF EXISTS "Usuários podem criar tickets" ON public.suporte_tickets;

-- Criar nova política de INSERT que permite admins criarem em nome de outros
CREATE POLICY "Users can create tickets"
ON public.suporte_tickets FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = solicitante_id 
  OR is_admin(auth.uid())
);