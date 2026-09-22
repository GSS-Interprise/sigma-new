-- One-shot, auditable campaign runs.  This is intentionally separate from
-- the recurring campaign cadence so a controlled throughput test cannot turn
-- into a permanent high-rate mode.
create table if not exists public.campanha_dispatch_one_shots (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  run_at timestamptz not null,
  max_contacts integer not null check (max_contacts between 1 and 500),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'running', 'succeeded', 'completed_with_errors', 'failed', 'cancelled')
  ),
  lock_token uuid,
  started_at timestamptz,
  finished_at timestamptz,
  attempted_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campanha_dispatch_one_shots_due_idx
  on public.campanha_dispatch_one_shots (status, run_at);

create unique index if not exists campanha_dispatch_one_shots_open_campaign_idx
  on public.campanha_dispatch_one_shots (campanha_id)
  where status in ('scheduled', 'running');

alter table public.campanha_dispatch_one_shots enable row level security;
grant all on public.campanha_dispatch_one_shots to service_role;
grant select on public.campanha_dispatch_one_shots to authenticated;

drop policy if exists campanha_dispatch_one_shots_read on public.campanha_dispatch_one_shots;
create policy campanha_dispatch_one_shots_read
  on public.campanha_dispatch_one_shots
  for select to authenticated
  using (true);

comment on table public.campanha_dispatch_one_shots is
  'Execução única de teste de disparo; o worker encerra a execução e impede repetição.';
