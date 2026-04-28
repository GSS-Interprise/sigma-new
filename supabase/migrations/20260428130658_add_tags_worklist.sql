ALTER TABLE public.worklist_tarefas ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
