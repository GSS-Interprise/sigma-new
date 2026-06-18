
-- Permitir que licitador e lider_licitacao criem/atualizem contrato_rascunho ao converter licitação arrematada em contrato

DROP POLICY IF EXISTS "Gestores de captação podem gerenciar contrato_rascunho" ON public.contrato_rascunho;
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar rascunhos" ON public.contrato_rascunho;

CREATE POLICY "Usuários autorizados podem gerenciar contrato_rascunho"
ON public.contrato_rascunho
FOR ALL
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar anexos de rascunho" ON public.contrato_rascunho_anexos;

CREATE POLICY "Usuários autorizados podem gerenciar anexos de rascunho"
ON public.contrato_rascunho_anexos
FOR ALL
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR has_role(auth.uid(), 'licitador'::app_role)
  OR has_role(auth.uid(), 'lider_licitacao'::app_role)
);
