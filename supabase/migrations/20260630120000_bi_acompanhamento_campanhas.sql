-- Aba BI "Acompanhamento Campanhas" (30/06): visão pra gestores/equipe de COMO as
-- campanhas estão — disparando ou paradas, IA × Manual, funil e chips online.
-- Disparo real: IA = campanha_lead_touches enviado; Manual = campanha_lead_tasks feita.
create or replace function public.get_bi_acompanhamento_campanhas(p_desde date default null)
returns json language sql stable security definer set search_path = public as $fn$
with eventos as (
  select cl.campanha_id, t.executado_em as ts, 'ia'::text origem
  from campanha_lead_touches t join campanha_leads cl on cl.id = t.campanha_lead_id
  where t.resultado = 'enviado' and t.executado_em is not null
  union all
  select cl.campanha_id, k.feita_em as ts, 'manual'::text origem
  from campanha_lead_tasks k join campanha_leads cl on cl.id = k.campanha_lead_id
  where k.status = 'feita' and k.feita_em is not null
),
funil as (
  select campanha_id,
    count(*) leads,
    count(*) filter (where status = 'frio') frio,
    count(*) filter (where status <> 'frio') contatados,
    count(*) filter (where status = 'em_conversa') em_conversa,
    count(*) filter (where status = 'quente') quente,
    count(*) filter (where status = 'convertido') convertido
  from campanha_leads group by campanha_id
),
camp as (
  select c.id, c.nome, c.tipo_envio, c.status,
    coalesce(c.chip_ids, case when c.chip_id is not null then array[c.chip_id] else '{}'::uuid[] end) chips_arr
  from campanhas c
  where c.status in ('ativa', 'pausada')
),
linhas as (
  select cp.id campanha_id, cp.nome campanha, cp.tipo_envio tipo, cp.status,
    coalesce(count(e.ts) filter (where e.ts::date = current_date), 0) disparos_hoje,
    coalesce(count(e.ts) filter (where e.ts >= now() - interval '7 days'), 0) disparos_7d,
    coalesce(count(e.ts), 0) disparos_total,
    max(e.ts) ultimo_disparo,
    coalesce(f.leads, 0) leads, coalesce(f.frio, 0) frio, coalesce(f.contatados, 0) contatados,
    coalesce(f.em_conversa, 0) em_conversa, coalesce(f.quente, 0) quente, coalesce(f.convertido, 0) convertido,
    coalesce(array_length(cp.chips_arr, 1), 0) chips_total,
    (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open') chips_online
  from camp cp
  left join eventos e on e.campanha_id = cp.id
  left join funil f on f.campanha_id = cp.id
  group by cp.id, cp.nome, cp.tipo_envio, cp.status, cp.chips_arr,
           f.leads, f.frio, f.contatados, f.em_conversa, f.quente, f.convertido
)
select json_build_object(
  'hoje', (select json_build_object(
     'ia', count(*) filter (where origem='ia'), 'manual', count(*) filter (where origem='manual'), 'total', count(*)
   ) from eventos where ts::date = current_date),
  'periodo', (select json_build_object(
     'ia', count(*) filter (where origem='ia'), 'manual', count(*) filter (where origem='manual'), 'total', count(*)
   ) from eventos where (p_desde is null or ts::date >= p_desde)),
  'resumo', (select json_build_object(
     'ativas', count(*) filter (where status='ativa'),
     'pausadas', count(*) filter (where status='pausada'),
     'rodando_hoje', count(*) filter (where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter (where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter (where status='ativa' and chips_online = 0)
   ) from linhas),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter (where origem='ia') ia, count(*) filter (where origem='manual') manual, count(*) total
     from eventos where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$fn$;
grant execute on function public.get_bi_acompanhamento_campanhas(date) to authenticated, service_role, anon;
