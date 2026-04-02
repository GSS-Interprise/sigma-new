
CREATE POLICY "Financeiro e líderes podem visualizar contrato_itens"
ON public.contrato_itens
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
  has_role(auth.uid(), 'diretoria'::app_role) OR
  has_role(auth.uid(), 'lideres'::app_role) OR
  has_role(auth.uid(), 'coordenador_escalas'::app_role)
);
