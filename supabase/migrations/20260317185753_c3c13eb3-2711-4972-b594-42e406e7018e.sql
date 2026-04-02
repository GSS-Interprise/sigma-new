
-- Drop políticas existentes conflitantes
DROP POLICY IF EXISTS "Admins podem visualizar todos os logs" ON public.auditoria_logs;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios logs" ON public.auditoria_logs;

-- Política única consolidada: admin e líder veem tudo; usuário normal vê apenas os seus
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  is_admin(auth.uid())
  OR is_leader(auth.uid())
  OR (auth.uid() = usuario_id)
);
