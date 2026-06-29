-- Monitor operacional de campanhas (29/06): "as campanhas estão disparando?
-- quantos disparos hoje/por dia, IA × Manual, por campanha".
-- A aba Prospecção lia disparos_contatos/disparo_manual_envios (módulo de disparo
-- avulso, parado desde 19/05) → não enxergava a MÁQUINA DE CAMPANHAS. Aqui a gente
-- conta o disparo real das campanhas:
--   IA      = campanha_lead_touches com resultado='enviado' (executado_em)
--   Manual  = campanha_lead_tasks com status='feita' (feita_em)
create or replace function public.get_bi_campanhas_monitor(p_desde date default null)
returns json language sql stable security definer set search_path = public as $fn$
with eventos as (
  select cl.campanha_id, t.executado_em as ts, 'ia'::text origem
  from campanha_lead_touches t
  join campanha_leads cl on cl.id = t.campanha_lead_id
  where t.resultado = 'enviado' and t.executado_em is not null
  union all
  select cl.campanha_id, k.feita_em as ts, 'manual'::text origem
  from campanha_lead_tasks k
  join campanha_leads cl on cl.id = k.campanha_lead_id
  where k.status = 'feita' and k.feita_em is not null
)
select json_build_object(
  'hoje', (select json_build_object(
     'ia', count(*) filter (where origem='ia'),
     'manual', count(*) filter (where origem='manual'),
     'total', count(*)
   ) from eventos where ts::date = current_date),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia,
            count(*) filter (where origem='ia') ia,
            count(*) filter (where origem='manual') manual,
            count(*) total
     from eventos
     where (p_desde is null or ts::date >= p_desde)
     group by ts::date
   ) x), '[]'),
  'por_campanha', coalesce((select json_agg(x order by x.disparos_total desc) from (
     select c.id campanha_id, c.nome campanha, c.tipo_envio tipo, c.status,
       count(e.ts) filter (where e.ts::date = current_date) disparos_hoje,
       count(e.ts) filter (where e.ts >= now() - interval '7 days') disparos_7d,
       count(e.ts) disparos_total,
       max(e.ts) ultimo_disparo
     from campanhas c
     left join eventos e on e.campanha_id = c.id
     where c.status in ('ativa','pausada')
     group by c.id, c.nome, c.tipo_envio, c.status
   ) x), '[]')
);
$fn$;
grant execute on function public.get_bi_campanhas_monitor(date) to authenticated, service_role, anon;
