-- BI: funil de cobertura por campanha (pedido da Ramone, reunião 16/06).
-- Responde "já chamamos todos os médicos daquela região?" comparando o
-- universo disponível na base (leads por especialidade_id da campanha, por UF)
-- com quantos estão na campanha e quantos já foram chamados.
create or replace function public.get_bi_funil_campanha(p_campanha_id uuid)
returns json language sql stable security definer set search_path=public as $fn$
with camp as (
  select id, nome, especialidade_ids, regiao_estado
  from campanhas where id = p_campanha_id
),
cl as (
  select cl.status, l.uf
  from campanha_leads cl
  join leads l on l.id = cl.lead_id
  where cl.campanha_id = p_campanha_id
),
uffunnel as (
  select uf, count(*) na_campanha, count(*) filter (where status <> 'frio') chamados
  from cl group by uf
),
disp as (
  select l.uf, count(*) disponiveis
  from leads l, camp c
  where c.especialidade_ids is not null and array_length(c.especialidade_ids,1) > 0
    and l.especialidade_id = any(c.especialidade_ids)
  group by l.uf
),
tasks as (
  select
    count(*) filter (where clt.status = 'feita') feitas,
    count(*) filter (where clt.status not in ('feita','descartada')
      and (clt.prazo_at is null or clt.prazo_at >= now() - interval '1 day')) pendentes,
    count(*) filter (where clt.status not in ('feita','descartada')
      and clt.prazo_at < now() - interval '1 day') atrasadas
  from campanha_lead_tasks clt
  join campanha_leads cl2 on cl2.id = clt.campanha_lead_id
  where cl2.campanha_id = p_campanha_id
)
select json_build_object(
  'nome', (select nome from camp),
  'tem_alvo_especialidade', (select especialidade_ids is not null and array_length(especialidade_ids,1) > 0 from camp),
  'funil', (select json_build_object(
     'na_campanha', count(*),
     'chamados', count(*) filter (where status <> 'frio'),
     'em_conversa', count(*) filter (where status = 'em_conversa'),
     'quente', count(*) filter (where status = 'quente'),
     'convertido', count(*) filter (where status = 'convertido'),
     'descartado', count(*) filter (where status = 'descartado'),
     'sem_resposta', count(*) filter (where status = 'sem_resposta')
   ) from cl),
  'universo_total', coalesce((select sum(disponiveis) from disp), 0),
  'por_uf', coalesce((select json_agg(x) from (
       select coalesce(u.uf, d.uf) uf,
              d.disponiveis,
              coalesce(u.na_campanha, 0) na_campanha,
              coalesce(u.chamados, 0) chamados,
              case when coalesce(d.disponiveis,0) > 0
                   then round(100.0 * coalesce(u.chamados,0) / d.disponiveis) end cobertura_pct
       from uffunnel u
       full join disp d on d.uf = u.uf
       where coalesce(d.disponiveis,0) > 0 or coalesce(u.na_campanha,0) > 0
       order by d.disponiveis desc nulls last, u.na_campanha desc
       limit 15
     ) x), '[]'),
  'tarefas', (select row_to_json(tasks) from tasks)
);
$fn$;
grant execute on function public.get_bi_funil_campanha(uuid) to authenticated, service_role, anon;
