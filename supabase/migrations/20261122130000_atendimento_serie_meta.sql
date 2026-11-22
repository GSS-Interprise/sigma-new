-- Painel de Tempo de resposta (BI): série por hora ou por dia e metas.
-- Mesma regra de atendimento_indicadores_base (20261122121000): espera = mensagem do contato depois de mensagem
-- nossa; resposta = 1ª mensagem nossa depois. Aqui só as esperas que pediam PESSOA: as respondidas pela IA/campanha
-- (sem usuário e sem origem celular) ficam de fora, contadas à parte em `automaticas`.

alter table public.atendimento_config
  add column if not exists meta_minutos int not null default 10 check (meta_minutos between 1 and 240),
  add column if not exists meta_pct int not null default 80 check (meta_pct between 1 and 100);

create or replace function public.atendimento_serie_base(p_de timestamptz, p_ate timestamptz, p_bucket text default 'hour')
returns table (bucket timestamptz, esperas int, em_meta int, depois int, sem_resposta int, mediana_min numeric, automaticas int)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce((select meta_minutos from atendimento_config where id), 10) as meta),
  msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
  ),
  esperas as (
    select e.conversation_id, e.sent_at as desde from msgs e
    where not e.from_me and coalesce(e.anterior_nossa, true) and e.sent_at >= p_de and e.sent_at < p_ate
  ),
  resp as (
    select es.desde, r.sent_at as respondida_em,
           (r.sent_at is not null and r.sent_by_user_id is null and not coalesce(r.celular, false)) as automatica
    from esperas es
    left join lateral (
      select m.sent_at, m.sent_by_user_id, m.celular from msgs m
      where m.conversation_id = es.conversation_id and m.from_me and m.sent_at > es.desde
      order by m.sent_at limit 1
    ) r on true
  )
  select (date_trunc(case when p_bucket = 'day' then 'day' else 'hour' end, r.desde at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as bucket,
         count(*) filter (where not r.automatica)::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde <= make_interval(mins => (select meta from cfg)))::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde > make_interval(mins => (select meta from cfg)))::int,
         count(*) filter (where r.respondida_em is null)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from r.respondida_em - r.desde) / 60.0)
                filter (where r.respondida_em is not null and not r.automatica))::numeric, 1),
         count(*) filter (where r.automatica)::int
  from resp r
  group by 1
  order by 1
$$;

create or replace function public.atendimento_serie(p_de timestamptz, p_ate timestamptz, p_bucket text default 'hour')
returns table (bucket timestamptz, esperas int, em_meta int, depois int, sem_resposta int, mediana_min numeric, automaticas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_ate <= p_de or p_ate - p_de > interval '31 days' then raise exception 'período inválido (até 31 dias)'; end if;
  return query select * from public.atendimento_serie_base(p_de, p_ate, p_bucket);
end $$;

revoke all on function public.atendimento_serie_base(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.atendimento_serie_base(timestamptz, timestamptz, text) to service_role;
revoke all on function public.atendimento_serie(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.atendimento_serie(timestamptz, timestamptz, text) to authenticated;
