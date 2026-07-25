-- Reserva um proxy dedicado por chip. As credenciais nunca entram no Postgres;
-- elas são resolvidas em runtime pela API do provider usando Supabase Secrets.
create table if not exists public.chip_proxy_assignments (
  id uuid primary key default gen_random_uuid(),
  chip_id uuid not null references public.chips(id) on delete cascade,
  provider text not null check (provider in ('webshare', 'bright_data')),
  provider_proxy_id text not null,
  proxy_host text not null,
  proxy_port integer not null check (proxy_port between 1 and 65535),
  country_code text,
  status text not null default 'active' check (status in ('active', 'unavailable', 'released')),
  assigned_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_latency_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  unique (chip_id),
  unique (provider, provider_proxy_id)
);

alter table public.chip_proxy_assignments enable row level security;

revoke all on table public.chip_proxy_assignments from anon, authenticated;
grant select, insert, update, delete on table public.chip_proxy_assignments to service_role;

comment on table public.chip_proxy_assignments is
  'Reserva exclusiva 1:1 entre chip e proxy. Credenciais ficam somente no provider/Supabase Secrets.';

create index if not exists idx_chip_proxy_assignments_provider_status
  on public.chip_proxy_assignments (provider, status);
