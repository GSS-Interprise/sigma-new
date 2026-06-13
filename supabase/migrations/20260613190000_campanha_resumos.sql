-- B1 — Resumo IA de campanha: cache do resumo executivo gerado por IA ao finalizar/pausar campanha.
-- Spec: plano-fechamento-contrato.md (Frente B). Edge: campanha-resumo-ia.

create table if not exists public.campanha_resumos (
  id          uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  resumo      jsonb not null,   -- {resumo_executivo, o_que_funcionou, perfil_melhor, objecoes[], ajuste_sugerido}
  metricas    jsonb,            -- snapshot dos números no momento da geração
  gerado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_campanha_resumos_campanha on public.campanha_resumos (campanha_id, created_at desc);

grant select, insert, update, delete on public.campanha_resumos to authenticated, service_role;

alter table public.campanha_resumos enable row level security;
create policy campanha_resumos_auth_read on public.campanha_resumos
  for select to authenticated using (true);
create policy campanha_resumos_auth_write on public.campanha_resumos
  for insert to authenticated with check (true);
-- service_role (edge) faz insert sem RLS; policy acima cobre geração via cliente se necessário.

comment on table public.campanha_resumos is 'Resumo executivo de campanha gerado por IA (Bloco 4). Edge: campanha-resumo-ia.';
