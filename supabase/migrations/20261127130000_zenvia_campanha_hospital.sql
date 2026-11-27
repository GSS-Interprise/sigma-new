-- Hospital da vaga nas campanhas da Zenvia (27/11/2026, Maikon: o BI abre com o nome do hospital em destaque).
-- As campanhas do Sigma já têm o hospital no briefing (briefing_ia.hospital/cidade). As da Zenvia são virtuais (uma
-- por especialidade, view zenvia_campanhas), então o hospital fica aqui, por especialidade, escrito no próprio BI.
create table if not exists public.zenvia_campanha_hospital (
  especialidade_id uuid primary key references public.especialidades(id) on delete cascade,
  hospital text not null check (length(trim(hospital)) between 1 and 120),
  cidade text check (cidade is null or length(cidade) <= 80),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);
alter table public.zenvia_campanha_hospital enable row level security;
drop policy if exists zenvia_campanha_hospital_ler on public.zenvia_campanha_hospital;
create policy zenvia_campanha_hospital_ler on public.zenvia_campanha_hospital for select to authenticated using (true);
drop policy if exists zenvia_campanha_hospital_gravar on public.zenvia_campanha_hospital;
create policy zenvia_campanha_hospital_gravar on public.zenvia_campanha_hospital for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.zenvia_campanha_hospital to authenticated, service_role;
