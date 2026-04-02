-- Add missing UPDATE and DELETE policies for contrato_anexos table
CREATE POLICY "Authorized users can update contrato_anexos"
ON public.contrato_anexos
FOR UPDATE
TO public
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "Authorized users can delete contrato_anexos"
ON public.contrato_anexos
FOR DELETE
TO public
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);