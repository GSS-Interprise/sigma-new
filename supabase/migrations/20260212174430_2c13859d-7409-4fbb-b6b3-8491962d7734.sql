
-- Drop the restrictive admin/leader SELECT policy
DROP POLICY IF EXISTS "Admins e líderes podem visualizar todos os tickets" ON public.suporte_tickets;

-- Recreate it to include 'externos' role users: they see tickets without responsável OR where they are responsável
CREATE POLICY "Admins líderes e externos podem visualizar tickets"
ON public.suporte_tickets
FOR SELECT
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid())
  OR (
    has_role(auth.uid(), 'externos') 
    AND (responsavel_ti_id IS NULL OR responsavel_ti_id = auth.uid())
  )
);

-- Also allow externos to update tickets they can see
DROP POLICY IF EXISTS "Admins e líderes podem atualizar todos os tickets" ON public.suporte_tickets;

CREATE POLICY "Admins líderes e externos podem atualizar tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR is_leader(auth.uid())
  OR (
    has_role(auth.uid(), 'externos') 
    AND (responsavel_ti_id IS NULL OR responsavel_ti_id = auth.uid())
  )
);
