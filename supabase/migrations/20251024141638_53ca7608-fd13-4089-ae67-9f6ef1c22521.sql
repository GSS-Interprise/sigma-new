-- Add RLS policy to allow gestor_contratos to manage medicos
CREATE POLICY "Gestores de contratos can manage medicos"
ON public.medicos
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;