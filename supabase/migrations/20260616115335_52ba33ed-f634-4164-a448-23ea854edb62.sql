
-- Permitir que o responsável da demanda também gerencie mencionados e finalizadores
-- (antes só o criador/admin conseguia, causando "violação de row level" quando o responsável editava)

DROP POLICY IF EXISTS "worklist_mencionados_insert" ON public.worklist_tarefa_mencionados;
DROP POLICY IF EXISTS "worklist_mencionados_delete" ON public.worklist_tarefa_mencionados;

CREATE POLICY "worklist_mencionados_insert"
ON public.worklist_tarefa_mencionados
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.worklist_tarefas t
    WHERE t.id = worklist_tarefa_mencionados.tarefa_id
      AND (t.created_by = auth.uid() OR t.responsavel_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "worklist_mencionados_delete"
ON public.worklist_tarefa_mencionados
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.worklist_tarefas t
    WHERE t.id = worklist_tarefa_mencionados.tarefa_id
      AND (t.created_by = auth.uid() OR t.responsavel_id = auth.uid() OR public.is_admin(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Criador/admin gerencia finalizadores" ON public.worklist_tarefa_finalizadores;

CREATE POLICY "Criador/responsavel/admin gerencia finalizadores"
ON public.worklist_tarefa_finalizadores
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.worklist_tarefas wt
    WHERE wt.id = worklist_tarefa_finalizadores.tarefa_id
      AND (wt.created_by = auth.uid() OR wt.responsavel_id = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.worklist_tarefas wt
    WHERE wt.id = worklist_tarefa_finalizadores.tarefa_id
      AND (wt.created_by = auth.uid() OR wt.responsavel_id = auth.uid())
  )
);
