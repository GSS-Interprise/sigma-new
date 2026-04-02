-- Drop existing policies for clientes
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Recrutadores can view clientes" ON public.clientes;

-- Create new policy allowing admins, gestores AND recrutadores to manage clientes
CREATE POLICY "Authorized users can manage clientes" 
ON public.clientes 
FOR ALL 
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_demanda'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_demanda'::app_role)
  OR has_role(auth.uid(), 'recrutador'::app_role)
);