
-- Remover política antiga de gerenciamento
DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar proposta" ON public.proposta;

-- Criar nova política que inclui usuários com permissão de contratos_servicos
CREATE POLICY "Usuários autorizados podem gerenciar proposta" 
ON public.proposta 
FOR ALL
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao') 
  OR has_role(auth.uid(), 'gestor_contratos')
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos')
);
