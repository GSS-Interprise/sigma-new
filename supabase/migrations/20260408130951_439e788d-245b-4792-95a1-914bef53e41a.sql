DROP POLICY "Authorized users can view contrato_anexos" ON public.contrato_anexos;

CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos
FOR SELECT
TO public
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
);