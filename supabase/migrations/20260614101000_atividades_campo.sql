-- Atividades de Campo: registro de visitas e reuniões da gestão
-- (Ramone, Maikon, João). Pedido do Dr. Maikon: "no fechamento do mês
-- dizer o que cada um fez — se visita um lugar e não está registrado,
-- parece que não foi". Prova de esforço de campo por pessoa/mês.
create table if not exists public.atividades_campo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'visita',            -- visita | reuniao | call | evento
  data_atividade date not null default current_date,
  responsavel_id uuid,                            -- quem fez (auth.users)
  responsavel_nome text,                          -- snapshot do nome
  local_nome text not null,                       -- texto livre (prospect ou cliente)
  cliente_id uuid references public.clientes(id) on delete set null, -- vínculo opcional
  contato_nome text,                              -- com quem falou no local
  objetivo text,
  resultado text,                                 -- o que saiu da visita
  proximo_passo text,
  gerou_oportunidade boolean not null default false,
  status text not null default 'realizada',       -- realizada | agendada | cancelada
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_atividades_campo_resp_data on public.atividades_campo (responsavel_id, data_atividade desc);
create index if not exists idx_atividades_campo_data on public.atividades_campo (data_atividade desc);

alter table public.atividades_campo enable row level security;

-- Equipe autenticada pode ver tudo (gestão precisa do consolidado);
-- escrita liberada pra autenticados (a tela fica atrás de adminOrLeader).
drop policy if exists atividades_campo_select on public.atividades_campo;
create policy atividades_campo_select on public.atividades_campo for select to authenticated using (true);
drop policy if exists atividades_campo_insert on public.atividades_campo;
create policy atividades_campo_insert on public.atividades_campo for insert to authenticated with check (true);
drop policy if exists atividades_campo_update on public.atividades_campo;
create policy atividades_campo_update on public.atividades_campo for update to authenticated using (true);
drop policy if exists atividades_campo_delete on public.atividades_campo;
create policy atividades_campo_delete on public.atividades_campo for delete to authenticated using (true);

grant select, insert, update, delete on public.atividades_campo to authenticated, service_role;

-- updated_at automático
create or replace function public.tg_atividades_campo_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_atividades_campo_updated on public.atividades_campo;
create trigger trg_atividades_campo_updated before update on public.atividades_campo
  for each row execute function public.tg_atividades_campo_updated();

-- Consolidado de fechamento por pessoa/mês (o relatório que o Maikon quer)
create or replace function public.get_atividades_campo_resumo(p_mes date default null)
returns json language sql stable security definer set search_path = public as $fn$
with base as (
  select * from atividades_campo
  where status <> 'cancelada'
    and (p_mes is null or date_trunc('month', data_atividade) = date_trunc('month', p_mes))
)
select json_build_object(
  'total', (select count(*) from base),
  'por_tipo', (select coalesce(json_agg(x order by x.n desc),'[]') from (
     select tipo, count(*) n from base group by tipo) x),
  'por_pessoa', (select coalesce(json_agg(x order by x.total desc),'[]') from (
     select coalesce(responsavel_nome,'(sem responsável)') pessoa,
       count(*) total,
       count(*) filter (where tipo='visita') visitas,
       count(*) filter (where tipo='reuniao') reunioes,
       count(*) filter (where tipo='call') calls,
       count(*) filter (where gerou_oportunidade) oportunidades
     from base group by 1) x)
);
$fn$;
grant execute on function public.get_atividades_campo_resumo(date) to authenticated, service_role, anon;
