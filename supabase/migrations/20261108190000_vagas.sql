-- Fase 4 do plano GSS dono no comando: vagas em aberto (plantão, ambulatório, fixa, sobreaviso)
-- com contador de dias e relatório diário das 7h. Não reaproveita `demandas` (modelo é quantidade
-- por período de contrato, não vaga).

create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  contrato_id uuid references public.contratos(id) on delete set null,
  hospital_nome text not null,
  cidade text not null,
  uf text,
  especialidade_id uuid not null references public.especialidades(id),
  tipo text not null check (tipo in ('plantao', 'ambulatorio', 'fixa', 'sobreaviso')),
  descricao text,
  valor text,
  quantidade int not null default 1 check (quantidade between 1 and 99),
  prioridade text not null default 'normal' check (prioridade in ('normal', 'urgente')),
  aberta_em date not null default current_date,
  responsavel_id uuid references public.profiles(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'em_negociacao', 'preenchida', 'cancelada')),
  preenchida_em date,
  medico_id uuid references public.medicos(id) on delete set null,
  -- Médico que ainda não está cadastrado no Sigma: o nome basta para fechar a vaga.
  medico_nome text,
  campanha_id uuid references public.campanhas(id) on delete set null,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vagas_status_aberta_idx on public.vagas (status, aberta_em);
create index if not exists vagas_especialidade_idx on public.vagas (especialidade_id);

create or replace function public.vagas_tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'preenchida' and old.status is distinct from 'preenchida' and new.preenchida_em is null then
    new.preenchida_em := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists vagas_tocar_updated_at on public.vagas;
create trigger vagas_tocar_updated_at before update on public.vagas
  for each row execute function public.vagas_tocar_updated_at();

-- Quem cuida da operação clínica e da captação cadastra e fecha vaga; qualquer logado lê.
create or replace function public.pode_gerir_vagas(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _uid is not null and (
    is_admin(_uid)
    or has_role(_uid, 'diretoria') or has_role(_uid, 'gestor_contratos') or has_role(_uid, 'gestor_captacao')
    or has_role(_uid, 'coordenador_escalas') or has_role(_uid, 'lideres')
    or is_captacao_leader(_uid)
  );
$$;
revoke all on function public.pode_gerir_vagas(uuid) from public, anon;
grant execute on function public.pode_gerir_vagas(uuid) to authenticated, service_role;

alter table public.vagas enable row level security;
drop policy if exists vagas_ler on public.vagas;
create policy vagas_ler on public.vagas for select to authenticated using (true);
drop policy if exists vagas_inserir on public.vagas;
create policy vagas_inserir on public.vagas for insert to authenticated with check (pode_gerir_vagas(auth.uid()));
drop policy if exists vagas_alterar on public.vagas;
create policy vagas_alterar on public.vagas for update to authenticated
  using (pode_gerir_vagas(auth.uid())) with check (pode_gerir_vagas(auth.uid()));

grant select, insert, update on public.vagas to authenticated;
grant all on public.vagas to service_role;

-- Vagas abertas com os dias em aberto (o número que a reunião de quinta olha).
create or replace view public.vagas_abertas_v
with (security_invoker = true) as
select
  v.*,
  (current_date - v.aberta_em) as dias_aberta,
  case
    when current_date - v.aberta_em <= 7 then 'ate_7'
    when current_date - v.aberta_em <= 15 then '8_a_15'
    when current_date - v.aberta_em <= 30 then '16_a_30'
    else 'mais_30'
  end as faixa,
  e.nome as especialidade_nome,
  coalesce(c.nome_fantasia, c.nome_empresa, c.razao_social) as cliente_nome,
  p.nome_completo as responsavel_nome,
  cp.nome as campanha_nome,
  cp.status::text as campanha_status
from public.vagas v
join public.especialidades e on e.id = v.especialidade_id
left join public.clientes c on c.id = v.cliente_id
left join public.profiles p on p.id = v.responsavel_id
left join public.campanhas cp on cp.id = v.campanha_id
where v.status in ('aberta', 'em_negociacao');

grant select on public.vagas_abertas_v to authenticated, service_role;

-- Destinatários do relatório das 7h. Linha única; edita-se pela tela de vagas (só admin).
create table if not exists public.vagas_relatorio_config (
  id boolean primary key default true check (id),
  emails text[] not null default '{}',
  whatsapp_destino text,
  whatsapp_numero_origem text,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.vagas_relatorio_config enable row level security;
drop policy if exists vagas_relatorio_config_ler on public.vagas_relatorio_config;
create policy vagas_relatorio_config_ler on public.vagas_relatorio_config for select to authenticated using (true);
drop policy if exists vagas_relatorio_config_alterar on public.vagas_relatorio_config;
create policy vagas_relatorio_config_alterar on public.vagas_relatorio_config for update to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
grant select, update on public.vagas_relatorio_config to authenticated;
grant all on public.vagas_relatorio_config to service_role;

-- Sócios com conta no Sigma (Maikon, João). Eron entra quando tiver e-mail confirmado.
insert into public.vagas_relatorio_config (id, emails, whatsapp_numero_origem)
values (true, array['maikon.madeira@gestaoservicosaude.com.br', 'jhcvillela@yahoo.com.br'], '+5547936183444')
on conflict (id) do nothing;

-- Histórico de envios do relatório (prova de que saiu e por onde).
create table if not exists public.vagas_relatorio_envios (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  vagas_abertas int not null,
  pdf_path text,
  email_ok boolean,
  email_erro text,
  whatsapp_ok boolean,
  whatsapp_erro text
);
alter table public.vagas_relatorio_envios enable row level security;
drop policy if exists vagas_relatorio_envios_ler on public.vagas_relatorio_envios;
create policy vagas_relatorio_envios_ler on public.vagas_relatorio_envios for select to authenticated using (true);
grant select on public.vagas_relatorio_envios to authenticated;
grant all on public.vagas_relatorio_envios to service_role;

insert into storage.buckets (id, name, public)
values ('vagas-relatorios', 'vagas-relatorios', false)
on conflict (id) do nothing;
