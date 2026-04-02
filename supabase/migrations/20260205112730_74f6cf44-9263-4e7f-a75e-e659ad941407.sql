
-- Remover política atual de gerenciamento
DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;

-- Política para INSERT: admins, gestores OU captadores com permissão pode_blacklist
CREATE POLICY "Authorized users can insert blacklist"
ON public.blacklist
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR has_captacao_permission(auth.uid(), 'blacklist')
);

-- Política para UPDATE/DELETE: apenas admins e gestores (remoção restrita)
CREATE POLICY "Admins and managers can update/delete blacklist"
ON public.blacklist
FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
);
