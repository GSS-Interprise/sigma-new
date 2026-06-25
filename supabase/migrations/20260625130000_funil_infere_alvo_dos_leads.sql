-- BI funil v3 (25/06): infere o ALVO (especialidade + região) a partir dos leads
-- quando a campanha não foi criada pelo wizard (importadas não têm especialidade_ids
-- nem regiao_estado → 28/41 campanhas ficavam "sem base de comparação").
-- Regra de inferência:
--   especialidade = especialidades dos leads que representam >=50% do volume do líder
--   região(UF)    = UF mais comum entre os leads
-- Flags espec_inferida / regiao_inferida deixam a UI avisar que o alvo é estimado.
create or replace function public.get_bi_funil_campanha(p_campanha_id uuid)
returns json language sql stable security definer set search_path=public as $fn$
with camp_raw as (
  select id, nome, especialidade_ids, regiao_estado, regiao_cidades
  from campanhas where id = p_campanha_id
),
esp_rank as (
  select le.especialidade_id esp_id, count(distinct le.lead_id) n
  from campanha_leads cl
  join lead_especialidades le on le.lead_id = cl.lead_id
  where cl.campanha_id = p_campanha_id
  group by le.especialidade_id
),
esp_inferido as (
  select array_agg(esp_id) ids
  from esp_rank
  where n >= 0.5 * (select max(n) from esp_rank)
),
uf_inferido as (
  select l.uf
  from campanha_leads cl join leads l on l.id = cl.lead_id
  where cl.campanha_id = p_campanha_id and nullif(btrim(l.uf),'') is not null
  group by l.uf order by count(*) desc limit 1
),
camp as (
  select cr.id, cr.nome, cr.regiao_cidades,
    case when cr.especialidade_ids is not null and array_length(cr.especialidade_ids,1) > 0
         then cr.especialidade_ids else (select ids from esp_inferido) end as especialidade_ids,
    ((cr.especialidade_ids is null or array_length(cr.especialidade_ids,1) = 0)
       and (select ids from esp_inferido) is not null) as espec_inferida,
    coalesce(cr.regiao_estado, (select uf from uf_inferido)) as regiao_estado,
    (cr.regiao_estado is null and (select uf from uf_inferido) is not null) as regiao_inferida
  from camp_raw cr
),
cl as (
  select cl.status, l.uf,
         (case when (select regiao_estado from camp) is null then true
               when l.uf = (select regiao_estado from camp) then
                 (case when coalesce(array_length((select regiao_cidades from camp),1),0)=0 then true
                       else upper(unaccent(btrim(coalesce(l.cidade,'')))) = any(
                            select upper(unaccent(btrim(x))) from unnest((select regiao_cidades from camp)) x) end)
               else false end) na_regiao
  from campanha_leads cl join leads l on l.id = cl.lead_id
  where cl.campanha_id = p_campanha_id
),
uffunnel as (
  select uf, count(*) na_campanha, count(*) filter (where status <> 'frio') chamados
  from cl group by uf
),
disp as (
  select l.uf,
         count(distinct l.id) disponiveis,
         count(distinct l.id) filter (where
            (select regiao_estado from camp) is null
            or (l.uf = (select regiao_estado from camp)
                and (coalesce(array_length((select regiao_cidades from camp),1),0)=0
                     or upper(unaccent(btrim(coalesce(l.cidade,'')))) = any(
                        select upper(unaccent(btrim(x))) from unnest((select regiao_cidades from camp)) x)))
         ) disponiveis_regiao
  from leads l
  join lead_especialidades le on le.lead_id = l.id
  join camp c on true
  where c.especialidade_ids is not null and array_length(c.especialidade_ids,1) > 0
    and le.especialidade_id = any(c.especialidade_ids)
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
  'espec_inferida', (select espec_inferida from camp),
  'regiao_inferida', (select regiao_inferida from camp),
  'regiao_label', (select case
       when regiao_estado is null then 'Brasil (região não definida)'
       when coalesce(array_length(regiao_cidades,1),0) > 0
         then regiao_estado || ' · ' || array_to_string(regiao_cidades, ', ')
       else regiao_estado end from camp),
  'funil', (select json_build_object(
     'na_campanha', count(*),
     'chamados', count(*) filter (where status <> 'frio'),
     'em_conversa', count(*) filter (where status = 'em_conversa'),
     'quente', count(*) filter (where status = 'quente'),
     'convertido', count(*) filter (where status = 'convertido'),
     'descartado', count(*) filter (where status = 'descartado'),
     'sem_resposta', count(*) filter (where status = 'sem_resposta')
   ) from cl),
  'chamados_regiao', (select count(*) filter (where status <> 'frio' and na_regiao) from cl),
  'universo_brasil', coalesce((select sum(disponiveis) from disp), 0),
  'universo_regiao', coalesce((select sum(disponiveis_regiao) from disp), 0),
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
