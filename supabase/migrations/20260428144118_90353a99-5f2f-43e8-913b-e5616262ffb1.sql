
CREATE TABLE IF NOT EXISTS public.worklist_tarefa_confirmacoes (
  tarefa_id UUID NOT NULL REFERENCES public.worklist_tarefas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, user_id)
);

ALTER TABLE public.worklist_tarefa_confirmacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users can view confirmacoes"
  ON public.worklist_tarefa_confirmacoes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "users can insert own confirmacao"
  ON public.worklist_tarefa_confirmacoes FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can delete own confirmacao"
  ON public.worklist_tarefa_confirmacoes FOR DELETE
  TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wtc_tarefa ON public.worklist_tarefa_confirmacoes(tarefa_id);
