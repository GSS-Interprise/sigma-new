
-- Restringe visibilidade de worklist_tarefas: somente envolvidos ou admin
DROP POLICY IF EXISTS worklist_tarefas_select ON public.worklist_tarefas;
DROP POLICY IF EXISTS worklist_tarefas_update ON public.worklist_tarefas;

CREATE POLICY worklist_tarefas_select ON public.worklist_tarefas
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.worklist_tarefa_mencionados m
    WHERE m.tarefa_id = worklist_tarefas.id AND m.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY worklist_tarefas_update ON public.worklist_tarefas
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.worklist_tarefa_mencionados m
    WHERE m.tarefa_id = worklist_tarefas.id AND m.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

-- Revoga acesso da view materializada agregada por setor para usuários comuns
REVOKE SELECT ON public.vw_worklist_pendencias_setor FROM anon;
REVOKE SELECT ON public.vw_worklist_pendencias_setor FROM authenticated;
