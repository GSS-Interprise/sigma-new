-- Adicionar política para gestores de radiologia visualizarem clientes
CREATE POLICY "Gestores de radiologia podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
);