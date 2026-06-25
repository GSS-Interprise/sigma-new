-- BI esforço v2 (25/06): a v1 contava como "atrasada" toda task com prazo vencido,
-- inclusive as auto-geradas pela cadência (1 por lead × passo) que NINGUÉM tocou.
-- Campanhas importadas com milhares de leads geravam 12k+ "atrasadas" → KPI assustava
-- os gestores sem refletir trabalho real. Aqui adiciono métricas honestas ao resumo:
--   fila            = tarefas em aberto nunca tocadas (backlog gerado, não "atraso")
--   leads           = leads distintos com tarefa
--   leads_trabalhados = leads com >=1 tarefa concluída (cobertura real do esforço)
-- Mantém os campos antigos (atrasadas/pendentes/pct_conclusao) p/ retrocompat.
create or replace function public.get_bi_esforco_equipe(p_desde date default null)
returns json language sql stable security definer set search_path = public as $fn$
with base as (
  select clt.id, clt.campanha_lead_id, clt.tipo, clt.status, clt.feita_por,
         clt.prazo_at, c.nome as campanha_nome, c.id as campanha_id, cl.lead_id,
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
    'fila', count(*) filter (where situacao in ('pendente','hoje','futura','snoozed','atrasada')),
    'descartadas', count(*) filter (where status='descartada'),
    'leads', count(distinct campanha_lead_id),
    'leads_trabalhados', count(distinct campanha_lead_id) filter (where status='feita'),
    'cobertura_pct', coalesce(round(100.0*count(distinct campanha_lead_id) filter (where status='feita')/nullif(count(distinct campanha_lead_id),0)),0),
    'pct_conclusao', coalesce(round(100.0*count(*) filter (where status='feita')/nullif(count(*) filter (where status<>'descartada'),0)),0)
  ) from base),
  'por_campanha', (select coalesce(json_agg(x order by x.total desc),'[]') from (
    select campanha_nome campanha, campanha_id, count(*) total,
      count(*) filter (where status='feita') feitas,
      count(*) filter (where situacao='atrasada') atrasadas,
      count(*) filter (where situacao in ('pendente','hoje','futura','snoozed')) pendentes,
      count(*) filter (where situacao in ('pendente','hoje','futura','snoozed','atrasada')) fila,
      count(*) filter (where status='descartada') descartadas,
      coalesce(round(100.0*count(*) filter (where status='feita')/nullif(count(*) filter (where status<>'descartada'),0)),0) pct,
      count(distinct campanha_lead_id) leads,
      count(distinct campanha_lead_id) filter (where status='feita') leads_trabalhados,
      coalesce(round(100.0*count(distinct campanha_lead_id) filter (where status='feita')/nullif(count(distinct campanha_lead_id),0)),0) cobertura_pct,
      count(distinct campanha_lead_id) filter (where status='feita' and tipo<>'whatsapp') leads_multicanal
    from base group by campanha_nome, campanha_id) x),
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
