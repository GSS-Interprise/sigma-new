DROP POLICY IF EXISTS worklist_tarefas_update ON public.worklist_tarefas;

CREATE POLICY worklist_tarefas_update
ON public.worklist_tarefas
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR responsavel_id = auth.uid()
  OR public.is_admin(auth.uid())
  OR (setor_destino_id IS NOT NULL AND setor_destino_id = public.user_setor_id(auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.worklist_tarefa_mencionados m
    WHERE m.tarefa_id = worklist_tarefas.id
      AND m.user_id = auth.uid()
  )
)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.pode_finalizar_demanda(_tarefa_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.worklist_tarefas wt
      WHERE wt.id = _tarefa_id
        AND (wt.created_by = _user_id OR wt.responsavel_id = _user_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.worklist_tarefa_finalizadores f
      WHERE f.tarefa_id = _tarefa_id
        AND f.user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.tg_check_finalizar_demanda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluida' AND COALESCE(OLD.status, '') <> 'concluida' THEN
    IF auth.uid() IS NOT NULL
       AND NOT public.pode_finalizar_demanda(NEW.id, auth.uid()) THEN
      RAISE EXCEPTION 'Apenas o criador, responsável ou finalizadores escolhidos podem concluir esta demanda'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;