-- Drop the existing policy
DROP POLICY IF EXISTS "Captação leaders can update user sectors" ON public.profiles;

-- Create a more permissive policy for captação management
-- Allows admin, gestor_captacao, or captação leaders to update setor_id
CREATE POLICY "Captação managers can update user sectors"
ON public.profiles
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
);