-- Fix (08/07): get_bi_campanhas_monitor também lia da tabela congelada
-- (campanha_lead_touches). Repointa igual ao acompanhamento: global -> chip_send_log
-- (fonte viva), por-campanha -> campanha_leads.data_ultimo_contato.
create or replace function public.get_bi_campanhas_monitor(p_desde date default null::date)
returns json language sql stable security definer set search_path to 'public' as $function$
with disp as (
  select sent_at as ts,
    case when evento_origem in ('cold_disparo','resposta_ia') then 'ia' else 'manual' end as origem
  from chip_send_log where sent_at is not null
),
funil as (
  select campanha_id,
    max(data_ultimo_contato) ultimo,
    count(*) filter (where data_ultimo_contato::date = current_date) hoje,
    count(*) filter (where data_ultimo_contato >= now() - interval '7 days') d7,
    count(*) filter (where status <> 'frio') total
  from campanha_leads group by campanha_id
)
select json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter (where origem='ia'), 'manual', count(*) filter (where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter (where origem='ia') ia, count(*) filter (where origem='manual') manual, count(*) total
     from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'por_campanha', coalesce((select json_agg(x order by x.disparos_total desc) from (
     select c.id campanha_id, c.nome campanha, c.tipo_envio tipo, c.status,
       coalesce(f.hoje,0) disparos_hoje, coalesce(f.d7,0) disparos_7d, coalesce(f.total,0) disparos_total, f.ultimo ultimo_disparo
     from campanhas c
     left join funil f on f.campanha_id = c.id
     where c.status in ('ativa','pausada')) x), '[]')
);
$function$;
