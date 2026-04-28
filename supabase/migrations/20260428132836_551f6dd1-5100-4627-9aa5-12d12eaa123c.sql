alter table public.worklist_tarefas
  add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists idx_worklist_tarefas_tags
  on public.worklist_tarefas using gin(tags);