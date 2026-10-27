-- Subida orgânica dos envios por dia (reunião com Ramone e Vinicius, 27/10).
-- O número oficial caiu quando os disparos subiram de uma vez. A regra agora é subir aos poucos
-- (ex.: +10 a cada 2 dias até a meta), e quem cuida disso é o Vinicius: só ele (e admin) pode
-- ligar, desligar ou mudar a subida. Ela para sozinha quando a Meta marca o número como RED,
-- porque subir volume com qualidade baixa derruba o número de novo.
-- O que sobe é o limite base (limite_diario_campanha). Se a campanha tiver um "aumento
-- programado" por data já vigente, ele continua mandando (o processor usa a etapa programada).

alter table public.captacao_permissoes_usuario
  add column if not exists pode_rampa boolean not null default false;

update public.captacao_permissoes_usuario c set pode_rampa = true
  from public.profiles p
 where p.id = c.user_id and lower(p.email) = 'vinicius.salomao@gestaoservicosaude.com.br';

alter table public.campanhas
  add column if not exists rampa_ativa boolean not null default false,
  add column if not exists rampa_incremento integer not null default 10 check (rampa_incremento between 1 and 100),
  add column if not exists rampa_cada_dias integer not null default 2 check (rampa_cada_dias between 1 and 30),
  add column if not exists rampa_teto integer not null default 450 check (rampa_teto between 1 and 2000),
  add column if not exists rampa_proximo_em date,
  add column if not exists rampa_parada_motivo text;

create table if not exists public.campanha_rampa_log (
  id bigint generated always as identity primary key,
  campanha_id uuid not null references public.campanhas(id) on delete cascade,
  em timestamptz not null default now(),
  de integer,
  para integer,
  motivo text not null
);
alter table public.campanha_rampa_log enable row level security;
create policy "Autenticados leem a rampa" on public.campanha_rampa_log for select to authenticated using (true);
grant select on public.campanha_rampa_log to authenticated;
grant all on public.campanha_rampa_log to service_role;

create or replace function public.pode_mexer_rampa(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(_user_id)
      or coalesce((select pode_rampa from public.captacao_permissoes_usuario where user_id = _user_id), false);
$$;
grant execute on function public.pode_mexer_rampa(uuid) to authenticated, service_role;

-- Quem pode editar campanha (RLS) não pode, só por isso, mexer na subida.
create or replace function public.campanhas_proteger_rampa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (new.rampa_ativa, new.rampa_incremento, new.rampa_cada_dias, new.rampa_teto)
         is distinct from (old.rampa_ativa, old.rampa_incremento, old.rampa_cada_dias, old.rampa_teto)
     and not public.pode_mexer_rampa(auth.uid()) then
    raise exception 'Só quem cuida da subida dos envios pode mudar essa configuração' using errcode = '42501';
  end if;
  -- ligou agora: o primeiro aumento é depois do intervalo, não hoje
  if new.rampa_ativa and (not coalesce(old.rampa_ativa, false) or new.rampa_proximo_em is null) then
    new.rampa_proximo_em := (now() at time zone 'America/Sao_Paulo')::date + new.rampa_cada_dias;
    new.rampa_parada_motivo := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_campanhas_proteger_rampa on public.campanhas;
create trigger trg_campanhas_proteger_rampa
  before update on public.campanhas
  for each row execute function public.campanhas_proteger_rampa();

-- Roda todo dia às 06h05 (Brasília). Só campanha ativa; parada por RED não avança a data,
-- então volta a subir no primeiro dia em que a qualidade sair do RED.
create or replace function public.aplicar_rampa_campanhas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_novo integer;
  v_feitas integer := 0;
begin
  for c in
    select cp.id, cp.limite_diario_campanha, cp.rampa_incremento, cp.rampa_cada_dias, cp.rampa_teto,
           upper(coalesce(s.quality_rating, '')) as qualidade
      from campanhas cp
      left join whatsapp_official_senders s on s.id = cp.official_sender_id
     where cp.rampa_ativa and cp.status = 'ativa'
       and coalesce(cp.rampa_proximo_em, v_hoje) <= v_hoje
  loop
    if c.qualidade = 'RED' then
      update campanhas set rampa_parada_motivo = 'Qualidade do número em RED na Meta' where id = c.id;
      insert into campanha_rampa_log (campanha_id, de, para, motivo)
      values (c.id, c.limite_diario_campanha, c.limite_diario_campanha, 'parada: qualidade RED');
      continue;
    end if;
    v_novo := least(c.rampa_teto, coalesce(c.limite_diario_campanha, 0) + c.rampa_incremento);
    if v_novo <= coalesce(c.limite_diario_campanha, 0) then
      update campanhas set rampa_ativa = false, rampa_parada_motivo = 'Chegou na meta', rampa_proximo_em = null where id = c.id;
      continue;
    end if;
    update campanhas
       set limite_diario_campanha = v_novo,
           rampa_proximo_em = v_hoje + c.rampa_cada_dias,
           rampa_parada_motivo = null
     where id = c.id;
    insert into campanha_rampa_log (campanha_id, de, para, motivo)
    values (c.id, c.limite_diario_campanha, v_novo, 'subida automática');
    v_feitas := v_feitas + 1;
  end loop;
  return v_feitas;
end;
$$;

revoke all on function public.aplicar_rampa_campanhas() from public;
grant execute on function public.aplicar_rampa_campanhas() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'campanhas-rampa-envios';
select cron.schedule('campanhas-rampa-envios', '5 9 * * *', $$ select public.aplicar_rampa_campanhas(); $$);
