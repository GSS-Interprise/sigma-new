
-- Allow captacao users (like Brenda) to insert proposta_itens when cloning proposals
CREATE POLICY "Captadores podem inserir proposta_itens"
ON public.proposta_itens
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- Also allow them to update proposta_itens (for editing linked proposals)
CREATE POLICY "Captadores podem atualizar proposta_itens"
ON public.proposta_itens
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- Also allow delete for captadores
CREATE POLICY "Captadores podem deletar proposta_itens"
ON public.proposta_itens
FOR DELETE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);
