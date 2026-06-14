-- BI: esforço da equipe nas tarefas de campanha (dor da Ramone:
-- saber se a equipe chamou todo mundo e insistiu por outras vias).
-- Agrega campanha_lead_tasks por campanha / canal / pessoa, sem estourar
-- o limite de 1000 linhas do PostgREST (retorna JSON pronto).
create or replace function public.get_bi_esforco_equipe(p_desde date default null)
returns json language sql stable security definer set search_path = public as $fn$
with base as (
  select clt.id, clt.campanha_lead_id, clt.tipo, clt.status, clt.feita_por,
         clt.prazo_at, c.nome as campanha_nome, cl.lead_id,
    case
      when clt.status='feita' then 'feita'
      when clt.status='descartada' then 'descartada'
      when clt.status='snooze' and clt.snooze_ate>now() then 'snoozed'
      when clt.prazo_at < (now()-interval '1 day') then 'atrasada'
      when clt.prazo_at::date = current_date then 'hoje'
      when clt.prazo_at > now() then 'futura'
      else 'pendente'
    end as situacao
  from campanha_lead_tasks clt
  join campanha_leads cl on cl.id=clt.campanha_lead_id
  join campanhas c on c.id=cl.campanha_id
  where (p_desde is null or clt.created_at >= p_desde)
)
select json_build_object(
  'resumo', (select json_build_object(
    'total', count(*),
    'feitas', count(*) filter (where status='feita'),
    'pendentes', count(*) filter (where situacao in ('pendente','hoje','futura','snoozed')),
    'atrasadas', count(*) filter (where situacao='atrasada'),
    'descartadas', count(*) filter (where status='descartada'),
    'pct_conclusao', coalesce(round(100.0*count(*) filter (where status='feita')/nullif(count(*) filter (where status<>'descartada'),0)),0)
  ) from base),
  'por_campanha', (select coalesce(json_agg(x order by x.total desc),'[]') from (
    select campanha_nome campanha, count(*) total,
      count(*) filter (where status='feita') feitas,
      count(*) filter (where situacao='atrasada') atrasadas,
      count(*) filter (where situacao in ('pendente','hoje','futura','snoozed')) pendentes,
      count(*) filter (where status='descartada') descartadas,
      coalesce(round(100.0*count(*) filter (where status='feita')/nullif(count(*) filter (where status<>'descartada'),0)),0) pct,
      count(distinct campanha_lead_id) leads,
      count(distinct campanha_lead_id) filter (where status='feita') leads_trabalhados,
      coalesce(round(100.0*count(distinct campanha_lead_id) filter (where status='feita')/nullif(count(distinct campanha_lead_id),0)),0) cobertura_pct,
      count(distinct campanha_lead_id) filter (where status='feita' and tipo<>'whatsapp') leads_multicanal
    from base group by campanha_nome) x),
  'por_canal', (select coalesce(json_agg(x order by x.total desc),'[]') from (
    select tipo canal, count(*) total,
      count(*) filter (where status='feita') feitas,
      count(*) filter (where situacao='atrasada') atrasadas,
      count(*) filter (where situacao in ('pendente','hoje','futura','snoozed')) pendentes
    from base group by tipo) x),
  'por_pessoa', (select coalesce(json_agg(x order by x.feitas desc),'[]') from (
    select coalesce(p.nome_completo,'Não atribuído') pessoa,
      count(*) filter (where b.status='feita') feitas,
      count(*) filter (where b.status='feita' and b.tipo='whatsapp') wpp,
      count(*) filter (where b.status='feita' and b.tipo='ligacao') ligacao,
      count(*) filter (where b.status='feita' and b.tipo='instagram') instagram,
      count(*) filter (where b.status='feita' and b.tipo='email') email
    from base b left join profiles p on p.id=b.feita_por
    where b.status='feita' group by 1) x),
  'atrasadas_top', (select coalesce(json_agg(x order by x.dias desc),'[]') from (
    select b.campanha_nome campanha, l.nome lead, b.tipo,
      extract(day from now()-b.prazo_at)::int dias
    from base b left join leads l on l.id=b.lead_id
    where b.situacao='atrasada' order by dias desc limit 50) x)
);
$fn$;
grant execute on function public.get_bi_esforco_equipe(date) to authenticated, service_role, anon;
