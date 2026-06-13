-- D1 — Banco de Notícias: catálogo de hospitais + notícias/ocorrências
-- Spec: docs/arquitetura/banco-noticias-hospitais.md
-- Pedido Maikon/Ramone 10/06: banco de hospitais que não pagam / má reputação
-- pras captadoras usarem de argumento com os médicos.
--
-- Convenção do projeto: especialidades via JUNCTION (não array), alinhado a lead_especialidades.

-- ========== TABELAS ==========

create table if not exists public.hospitais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text,
  uf          text,
  cidade      text,
  regiao      text,                       -- agrupador livre (ex: "Vale do Itajaí")
  tipo_local  text,                       -- hospital | UPA | clínica | município | outro
  observacoes text,
  ativo       boolean not null default true,
  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.hospital_especialidades (
  hospital_id     uuid not null references public.hospitais(id) on delete cascade,
  especialidade_id uuid not null references public.especialidades(id) on delete cascade,
  primary key (hospital_id, especialidade_id)
);

create table if not exists public.hospital_noticias (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitais(id) on delete cascade,
  tipo        text not null,              -- calote | processo_trabalhista | ma_reputacao | atraso_pagamento | outro
  titulo      text not null,
  resumo      text,
  fonte_url   text,                       -- link (Instagram, portal de notícia)
  fonte_print text,                       -- caminho no Storage bucket hospital-noticias
  data_fato   date,
  gravidade   smallint not null default 2 check (gravidade between 1 and 3),  -- 1 baixa · 2 média · 3 alta
  tags        text[] not null default '{}',
  criado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ========== ÍNDICES ==========
create index if not exists idx_hospitais_nome_trgm
  on public.hospitais using gin (nome gin_trgm_ops);
create index if not exists idx_hospitais_uf on public.hospitais (uf);
create index if not exists idx_hospital_noticias_hospital on public.hospital_noticias (hospital_id);
create index if not exists idx_hospital_especialidades_esp on public.hospital_especialidades (especialidade_id);

-- ========== updated_at ==========
drop trigger if exists trg_hospitais_updated_at on public.hospitais;
create trigger trg_hospitais_updated_at
  before update on public.hospitais
  for each row execute function public.update_updated_at_column();

-- ========== GRANT (tabela via SQL direto NÃO ganha GRANT default -> edge crasha 42501) ==========
grant select, insert, update, delete on public.hospitais             to authenticated, service_role;
grant select, insert, update, delete on public.hospital_especialidades to authenticated, service_role;
grant select, insert, update, delete on public.hospital_noticias     to authenticated, service_role;

-- ========== RLS ==========
alter table public.hospitais             enable row level security;
alter table public.hospital_especialidades enable row level security;
alter table public.hospital_noticias     enable row level security;

-- v1: qualquer usuário autenticado lê e mantém o catálogo (confiança no time; refinar por role depois)
create policy hospitais_auth_all on public.hospitais
  for all to authenticated using (true) with check (true);
create policy hospital_esp_auth_all on public.hospital_especialidades
  for all to authenticated using (true) with check (true);
create policy hospital_noticias_auth_all on public.hospital_noticias
  for all to authenticated using (true) with check (true);

-- ========== STORAGE (prints das notícias) ==========
insert into storage.buckets (id, name, public)
values ('hospital-noticias', 'hospital-noticias', true)
on conflict (id) do nothing;

create policy hospital_noticias_storage_read on storage.objects
  for select to authenticated using (bucket_id = 'hospital-noticias');
create policy hospital_noticias_storage_write on storage.objects
  for insert to authenticated with check (bucket_id = 'hospital-noticias');
create policy hospital_noticias_storage_update on storage.objects
  for update to authenticated using (bucket_id = 'hospital-noticias');
create policy hospital_noticias_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'hospital-noticias');

comment on table public.hospitais is 'Catálogo de hospitais/locais (Banco de Notícias). Spec: banco-noticias-hospitais.md';
comment on table public.hospital_noticias is 'Ocorrências/notícias por hospital (calote, processo, má reputação) — argumento pras captadoras.';
