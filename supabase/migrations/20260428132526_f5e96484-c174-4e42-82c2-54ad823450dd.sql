alter table public.worklist_tarefa_comentarios
  add column if not exists mencionados uuid[] not null default '{}'::uuid[],
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamp with time zone not null default now();

create table if not exists public.worklist_tarefa_atividades (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.worklist_tarefas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  tipo text not null,
  resumo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_worklist_tarefa_comentarios_tarefa_id
  on public.worklist_tarefa_comentarios(tarefa_id, created_at desc);

create index if not exists idx_worklist_tarefa_comentarios_user_id
  on public.worklist_tarefa_comentarios(user_id);

create index if not exists idx_worklist_tarefa_comentarios_mencionados
  on public.worklist_tarefa_comentarios using gin(mencionados);

create index if not exists idx_worklist_tarefa_atividades_tarefa_id
  on public.worklist_tarefa_atividades(tarefa_id, created_at desc);

create index if not exists idx_worklist_tarefa_atividades_user_id
  on public.worklist_tarefa_atividades(user_id);

alter table public.worklist_tarefa_atividades enable row level security;

drop policy if exists "worklist_atividades_select" on public.worklist_tarefa_atividades;
create policy "worklist_atividades_select"
on public.worklist_tarefa_atividades
for select
to authenticated
using (public.can_view_worklist_tarefa(tarefa_id, auth.uid()));

drop policy if exists "worklist_atividades_insert" on public.worklist_tarefa_atividades;
create policy "worklist_atividades_insert"
on public.worklist_tarefa_atividades
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_view_worklist_tarefa(tarefa_id, auth.uid())
);

drop policy if exists "worklist_atividades_delete" on public.worklist_tarefa_atividades;
create policy "worklist_atividades_delete"
on public.worklist_tarefa_atividades
for delete
to authenticated
using (
  public.is_admin(auth.uid())
  or exists (
    select 1
    from public.worklist_tarefas t
    where t.id = worklist_tarefa_atividades.tarefa_id
      and t.created_by = auth.uid()
  )
);

create or replace function public.set_worklist_comentarios_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_worklist_comentarios_updated_at on public.worklist_tarefa_comentarios;
create trigger trg_worklist_comentarios_updated_at
before update on public.worklist_tarefa_comentarios
for each row
execute function public.set_worklist_comentarios_updated_at();