DROP POLICY IF EXISTS worklist_tarefas_update ON public.worklist_tarefas;
CREATE POLICY worklist_tarefas_update ON public.worklist_tarefas
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR is_admin(auth.uid())
  OR (setor_destino_id IS NOT NULL AND setor_destino_id = user_setor_id(auth.uid()))
  OR EXISTS (SELECT 1 FROM worklist_tarefa_mencionados m WHERE m.tarefa_id = worklist_tarefas.id AND m.user_id = auth.uid())
);