-- Remover políticas antigas se existirem e criar novas
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar medicos" ON public.medicos;
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;

-- Adicionar política para gestor_radiologia visualizar médicos
CREATE POLICY "Gestores de radiologia podem visualizar medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
  has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- Adicionar política para gestor_radiologia visualizar clientes
CREATE POLICY "Gestores de radiologia podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);