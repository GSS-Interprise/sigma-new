-- Atualizar política RLS da tabela ages_propostas para incluir permissões de captadores
DROP POLICY IF EXISTS "Authorized users can manage ages_propostas" ON public.ages_propostas;

CREATE POLICY "Authorized users can manage ages_propostas" 
ON public.ages_propostas
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_ages'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_ages'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);