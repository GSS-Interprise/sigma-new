-- Expandir leitura (SELECT) de contratos para usuários de captação via permissões
-- Mantém políticas existentes e adiciona uma nova política mais abrangente.

CREATE POLICY "Captacao pode visualizar contratos"
ON public.contratos
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);

-- Expandir leitura (SELECT) de unidades para usuários de captação via permissões
CREATE POLICY "Captacao pode visualizar unidades"
ON public.unidades
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);
