-- Atualizar política de visualização de médicos para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar medicos" ON public.medicos;

CREATE POLICY "Gestores podem visualizar medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role) 
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);