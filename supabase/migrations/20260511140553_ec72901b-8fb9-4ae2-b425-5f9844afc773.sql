GRANT SELECT, INSERT, DELETE ON public.worklist_tarefa_anexos TO authenticated;
GRANT SELECT ON public.worklist_tarefa_anexos TO anon;

DROP POLICY IF EXISTS "worklist_anexos_select" ON public.worklist_tarefa_anexos;
DROP POLICY IF EXISTS "worklist_anexos_insert" ON public.worklist_tarefa_anexos;
DROP POLICY IF EXISTS "worklist_anexos_delete" ON public.worklist_tarefa_anexos;

CREATE POLICY "worklist_anexos_select"
ON public.worklist_tarefa_anexos
FOR SELECT
TO authenticated
USING (public.can_view_worklist_tarefa(tarefa_id, auth.uid()));

CREATE POLICY "worklist_anexos_insert"
ON public.worklist_tarefa_anexos
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_view_worklist_tarefa(tarefa_id, auth.uid()));

CREATE POLICY "worklist_anexos_delete"
ON public.worklist_tarefa_anexos
FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR public.is_admin(auth.uid()));