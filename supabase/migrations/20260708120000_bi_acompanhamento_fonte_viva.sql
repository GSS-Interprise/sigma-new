-- Fix (08/07): o BI de Acompanhamento mostrava "disparos hoje 0 / máquina parada"
-- porque a fonte de disparos era `campanha_lead_touches` (CONGELADA ~12/06). O real
-- está em `chip_send_log` (sent_at + evento_origem). Repointa:
--   - Global (hoje/período/por-dia, IA×manual) → chip_send_log (fonte viva).
--   - Por-campanha (atividade/parada) → campanha_leads.data_ultimo_contato (vivo).
create or replace function public.get_bi_acompanhamento_campanhas(p_desde date default null::date)
returns json language sql stable security definer set search_path to 'public' as $function$
with disp as (
  -- disparos reais (fonte VIVA). IA = cold/resposta da IA; manual = equipe.
  select sent_at as ts,
    case when evento_origem in ('cold_disparo','resposta_ia') then 'ia' else 'manual' end as origem
  from chip_send_log
  where sent_at is not null
),
funil as (
  select campanha_id,
    count(*) leads,
    count(*) filter (where status = 'frio') frio,
    count(*) filter (where status <> 'frio') contatados,
    count(*) filter (where status = 'em_conversa') em_conversa,
    count(*) filter (where status = 'quente') quente,
    count(*) filter (where status = 'convertido') convertido,
    max(data_ultimo_contato) ultima_atividade,
    count(*) filter (where data_ultimo_contato::date = current_date) contatados_hoje,
    count(*) filter (where data_ultimo_contato >= now() - interval '7 days') contatados_7d
  from campanha_leads group by campanha_id
),
camp as (
  select c.id, c.nome, c.tipo_envio, c.status,
    coalesce(c.chip_ids, case when c.chip_id is not null then array[c.chip_id] else '{}'::uuid[] end) chips_arr
  from campanhas c where c.status in ('ativa','pausada')
),
linhas as (
  select cp.id campanha_id, cp.nome campanha, cp.tipo_envio tipo, cp.status,
    coalesce(f.contatados_hoje,0) disparos_hoje,
    coalesce(f.contatados_7d,0) disparos_7d,
    coalesce(f.contatados,0) disparos_total,
    f.ultima_atividade ultimo_disparo,
    coalesce(f.leads,0) leads, coalesce(f.frio,0) frio, coalesce(f.contatados,0) contatados,
    coalesce(f.em_conversa,0) em_conversa, coalesce(f.quente,0) quente, coalesce(f.convertido,0) convertido,
    coalesce(array_length(cp.chips_arr,1),0) chips_total,
    (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open') chips_online
  from camp cp left join funil f on f.campanha_id = cp.id
)
select json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'periodo', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where (p_desde is null or ts::date >= p_desde)),
  'resumo', (select json_build_object(
     'ativas', count(*) filter(where status='ativa'),
     'pausadas', count(*) filter(where status='pausada'),
     'rodando_hoje', count(*) filter(where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter(where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter(where status='ativa' and chips_online = 0)
   ) from linhas),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter(where origem='ia') ia, count(*) filter(where origem='manual') manual, count(*) total
     from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$function$;
