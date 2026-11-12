-- SLA de laudos: escala de plantão, alertas ao médico, anotações por exame e "assumir".
-- Plano: docs/arquitetura/sla-laudos-radiologia.md. Quem opera: Wagner e Brenda (papel gestor_radiologia) e admins.

create or replace function public.sla_pode_operar(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(_uid), false) or coalesce(has_role(_uid, 'gestor_radiologia'::app_role), false)
$$;
grant execute on function public.sla_pode_operar(uuid) to authenticated;

-- Escala: quem está de plantão em cada intervalo. O robô só aciona quem está escalado na hora.
-- papel define a escada: plantonista recebe primeiro; coordenador quando vence sem ninguém assumir; diretoria depois.
create table if not exists public.sla_plantao (
  id uuid primary key default gen_random_uuid(),
  unidade text not null default 'marieta',
  papel text not null check (papel in ('plantonista', 'coordenador', 'diretoria')),
  inicio timestamptz not null,
  fim timestamptz not null check (fim > inicio),
  medico_id uuid references public.medicos (id) on delete set null,
  nome text not null,
  telefone text not null check (telefone ~ '^55\d{10,11}$'),
  email text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists sla_plantao_janela on public.sla_plantao (unidade, papel, inicio, fim);

-- Exame assumido (pelo botão do WhatsApp ou pela tela) e exame silenciado (não precisa de laudo): param os alertas.
alter table public.sla_exames add column if not exists assumido_em timestamptz;
alter table public.sla_exames add column if not exists assumido_por text;
alter table public.sla_exames add column if not exists assumido_via text check (assumido_via in ('whatsapp', 'sigma'));
alter table public.sla_exames add column if not exists silenciado_em timestamptz;

-- Cada aviso disparado. É o histórico que substitui o grupo "SLA" (a API oficial não manda mensagem em grupo).
create table if not exists public.sla_alertas (
  id uuid primary key default gen_random_uuid(),
  exame_id uuid references public.sla_exames (id) on delete cascade,
  tipo text not null check (tipo in ('prazo', 'vencido', 'sem_escala')),
  papel text,
  plantao_id uuid references public.sla_plantao (id) on delete set null,
  destino_nome text,
  destino text,
  canal text not null check (canal in ('whatsapp', 'email', 'ligacao')),
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou', 'entregue', 'lido', 'respondido')),
  erro text,
  mensagem_id text,
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists sla_alertas_exame on public.sla_alertas (exame_id, tipo);
create index if not exists sla_alertas_criado on public.sla_alertas (criado_em desc);

-- Anotações de quem acompanha o plantão. Ações rápidas mudam o exame (ver sla_exame_anotar).
create table if not exists public.sla_exame_notas (
  id uuid primary key default gen_random_uuid(),
  exame_id uuid not null references public.sla_exames (id) on delete cascade,
  tipo text not null check (tipo in ('nota', 'avisei_medico', 'nao_precisa_laudo', 'problema_pacs')),
  texto text,
  autor_id uuid default auth.uid(),
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists sla_exame_notas_exame on public.sla_exame_notas (exame_id, criado_em desc);

alter table public.sla_plantao enable row level security;
alter table public.sla_alertas enable row level security;
alter table public.sla_exame_notas enable row level security;
drop policy if exists sla_plantao_ler on public.sla_plantao;
create policy sla_plantao_ler on public.sla_plantao for select to authenticated using (sla_pode_operar(auth.uid()));
drop policy if exists sla_plantao_escrever on public.sla_plantao;
create policy sla_plantao_escrever on public.sla_plantao for all to authenticated
  using (sla_pode_operar(auth.uid())) with check (sla_pode_operar(auth.uid()));
drop policy if exists sla_alertas_ler on public.sla_alertas;
create policy sla_alertas_ler on public.sla_alertas for select to authenticated using (sla_pode_operar(auth.uid()));
drop policy if exists sla_exame_notas_ler on public.sla_exame_notas;
create policy sla_exame_notas_ler on public.sla_exame_notas for select to authenticated using (sla_pode_operar(auth.uid()));
-- Tabela criada por SQL não ganha GRANT sozinha (incidente 18/05).
grant select, insert, update, delete on public.sla_plantao to authenticated;
grant select on public.sla_alertas, public.sla_exame_notas to authenticated;
grant all on public.sla_plantao, public.sla_alertas, public.sla_exame_notas to service_role;

-- Anotação pela tela. "avisei_medico" vale como assumido (para os alertas); "nao_precisa_laudo" silencia o exame.
create or replace function public.sla_exame_anotar(p_exame uuid, p_tipo text, p_texto text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_id uuid;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_tipo not in ('nota', 'avisei_medico', 'nao_precisa_laudo', 'problema_pacs') then raise exception 'tipo_invalido'; end if;
  if p_tipo = 'nota' and coalesce(trim(p_texto), '') = '' then raise exception 'texto_vazio'; end if;
  select coalesce(nullif(trim(nome_completo), ''), email) into v_nome from profiles where id = auth.uid();
  insert into sla_exame_notas (exame_id, tipo, texto, autor_nome)
  values (p_exame, p_tipo, nullif(trim(p_texto), ''), v_nome) returning id into v_id;
  if p_tipo = 'avisei_medico' then
    update sla_exames set assumido_em = coalesce(assumido_em, now()), assumido_por = coalesce(assumido_por, v_nome),
      assumido_via = coalesce(assumido_via, 'sigma') where id = p_exame;
  elsif p_tipo = 'nao_precisa_laudo' then
    update sla_exames set silenciado_em = coalesce(silenciado_em, now()) where id = p_exame;
  end if;
  return v_id;
end;
$$;
revoke all on function public.sla_exame_anotar(uuid, text, text) from public, anon;
grant execute on function public.sla_exame_anotar(uuid, text, text) to authenticated;
