-- Atualizar política RLS de medico_kanban_cards para incluir captadores
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards;

CREATE POLICY "Usuários autorizados podem gerenciar cards" ON public.medico_kanban_cards
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);