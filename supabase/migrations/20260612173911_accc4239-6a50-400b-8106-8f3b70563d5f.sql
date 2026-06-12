
-- 1. Tabela de finalizadores
CREATE TABLE IF NOT EXISTS public.worklist_tarefa_finalizadores (
  tarefa_id uuid NOT NULL REFERENCES public.worklist_tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.worklist_tarefa_finalizadores TO authenticated;
GRANT ALL ON public.worklist_tarefa_finalizadores TO service_role;

ALTER TABLE public.worklist_tarefa_finalizadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Envolvidos podem ler finalizadores"
  ON public.worklist_tarefa_finalizadores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Criador/admin gerencia finalizadores"
  ON public.worklist_tarefa_finalizadores FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.worklist_tarefas wt
      WHERE wt.id = worklist_tarefa_finalizadores.tarefa_id
        AND wt.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.worklist_tarefas wt
      WHERE wt.id = worklist_tarefa_finalizadores.tarefa_id
        AND wt.created_by = auth.uid()
    )
  );

-- 2. Função que decide se um usuário pode concluir uma demanda
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
      SELECT 1 FROM public.worklist_tarefas wt
      WHERE wt.id = _tarefa_id AND wt.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.worklist_tarefa_finalizadores f
      WHERE f.tarefa_id = _tarefa_id AND f.user_id = _user_id
    );
$$;

-- 3. Trigger que bloqueia conclusão por quem não pode finalizar
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
      RAISE EXCEPTION 'Apenas o criador e finalizadores escolhidos podem concluir esta demanda'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_finalizar_demanda ON public.worklist_tarefas;
CREATE TRIGGER check_finalizar_demanda
  BEFORE UPDATE ON public.worklist_tarefas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_check_finalizar_demanda();

-- 4. Backfill: responsável atual vira finalizador
INSERT INTO public.worklist_tarefa_finalizadores (tarefa_id, user_id)
SELECT id, responsavel_id
FROM public.worklist_tarefas
WHERE responsavel_id IS NOT NULL
ON CONFLICT DO NOTHING;
