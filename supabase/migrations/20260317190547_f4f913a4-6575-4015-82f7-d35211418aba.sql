
-- Substituir por política direta sem depender da função is_admin
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
