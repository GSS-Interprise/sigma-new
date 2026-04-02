
-- Atualizar política RLS: apenas admins podem visualizar logs de auditoria
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (is_admin(auth.uid()));
