-- Remover política antiga de gerenciamento
DROP POLICY IF EXISTS "Gestores de contratos can manage medicos" ON public.medicos;

-- Criar nova política que inclui líderes de captação e usuários com permissão contratos_servicos
CREATE POLICY "Gestores de contratos can manage medicos" 
ON public.medicos 
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