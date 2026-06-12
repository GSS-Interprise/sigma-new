
-- 1) Novas colunas em worklist_tarefas
ALTER TABLE public.worklist_tarefas
  ADD COLUMN IF NOT EXISTS data_limite_hora time,
  ADD COLUMN IF NOT EXISTS duracao_min int,
  ADD COLUMN IF NOT EXISTS alerta_2h_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid;

-- 2) Tabela de recorrências
CREATE TABLE IF NOT EXISTS public.worklist_tarefa_recorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'tarefa',
  urgencia text NOT NULL DEFAULT 'media',
  setor_destino_id uuid,
  escopo text NOT NULL DEFAULT 'pessoal',
  created_by uuid NOT NULL,
  frequencia text NOT NULL CHECK (frequencia IN ('diaria','semanal','mensal')),
  dias_semana int[] NOT NULL DEFAULT '{}',
  dia_mes int,
  hora time NOT NULL,
  duracao_min int NOT NULL DEFAULT 60,
  participantes uuid[] NOT NULL DEFAULT '{}',
  checklist_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  proxima_geracao date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- FK da tarefa para recorrência (cria só se ainda não existe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'worklist_tarefas_recorrencia_fk'
  ) THEN
    ALTER TABLE public.worklist_tarefas
      ADD CONSTRAINT worklist_tarefas_recorrencia_fk
      FOREIGN KEY (recorrencia_id)
      REFERENCES public.worklist_tarefa_recorrencias(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Índice único: 1 instância por (recorrência, data)
CREATE UNIQUE INDEX IF NOT EXISTS worklist_tarefas_recorrencia_data_unique
  ON public.worklist_tarefas (recorrencia_id, data_limite)
  WHERE recorrencia_id IS NOT NULL;

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS worklist_tarefas_data_limite_idx
  ON public.worklist_tarefas (data_limite);
CREATE INDEX IF NOT EXISTS worklist_tarefas_alerta_2h_idx
  ON public.worklist_tarefas (data_limite, data_limite_hora)
  WHERE alerta_2h_enviado_at IS NULL AND status <> 'concluida';

-- 3) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worklist_tarefa_recorrencias TO authenticated;
GRANT ALL ON public.worklist_tarefa_recorrencias TO service_role;

-- 4) RLS
ALTER TABLE public.worklist_tarefa_recorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS worklist_tarefa_recorrencias_select ON public.worklist_tarefa_recorrencias;
CREATE POLICY worklist_tarefa_recorrencias_select
  ON public.worklist_tarefa_recorrencias
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_admin(auth.uid())
    OR (setor_destino_id IS NOT NULL AND setor_destino_id = user_setor_id(auth.uid()))
    OR auth.uid() = ANY (participantes)
    OR escopo = 'geral'
  );

DROP POLICY IF EXISTS worklist_tarefa_recorrencias_insert ON public.worklist_tarefa_recorrencias;
CREATE POLICY worklist_tarefa_recorrencias_insert
  ON public.worklist_tarefa_recorrencias
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS worklist_tarefa_recorrencias_update ON public.worklist_tarefa_recorrencias;
CREATE POLICY worklist_tarefa_recorrencias_update
  ON public.worklist_tarefa_recorrencias
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR is_admin(auth.uid())
    OR (setor_destino_id IS NOT NULL AND setor_destino_id = user_setor_id(auth.uid()))
  );

DROP POLICY IF EXISTS worklist_tarefa_recorrencias_delete ON public.worklist_tarefa_recorrencias;
CREATE POLICY worklist_tarefa_recorrencias_delete
  ON public.worklist_tarefa_recorrencias
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR is_admin(auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_worklist_tarefa_recorrencias ON public.worklist_tarefa_recorrencias;
CREATE TRIGGER set_updated_at_worklist_tarefa_recorrencias
BEFORE UPDATE ON public.worklist_tarefa_recorrencias
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
