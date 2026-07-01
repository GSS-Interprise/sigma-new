-- Prospecção: funil completo por especialidade/estado + coorte mensal de contatados
-- por especialidade (30/06). Fonte real = campanha_leads (status) + leads (uf) +
-- lead_especialidades (junção). "Contatado" = status <> 'frio'. Mês = data_primeiro_contato.
create or replace function public.get_bi_prospec_funil(p_uf text default null, p_especialidade_id uuid default null)
returns json language sql stable security definer set search_path = public as $fn$
with base as (
  select clx.id cl_id, clx.lead_id, clx.status, clx.data_primeiro_contato, l.uf
  from campanha_leads clx join leads l on l.id = clx.lead_id
  where (p_uf is null or l.uf = p_uf)
),
base_esp as (
  select b.cl_id, b.lead_id, b.status, b.data_primeiro_contato, b.uf, le.especialidade_id
  from base b join lead_especialidades le on le.lead_id = b.lead_id
),
-- linhas do funil já filtradas (distinct por campanha_lead; conta médicos distintos abaixo)
funil_rows as (
  select distinct cl_id, lead_id, status, data_primeiro_contato
  from base_esp
  where (p_especialidade_id is null or especialidade_id = p_especialidade_id)
),
-- top especialidades por contatados (pra coorte mensal legível)
top_esp as (
  select especialidade_id, count(*) filter (where status <> 'frio') n
  from base_esp
  where (p_especialidade_id is null or especialidade_id = p_especialidade_id)
  group by especialidade_id
  having count(*) filter (where status <> 'frio') > 0
  order by n desc limit 8
),
coorte as (
  select to_char(date_trunc('month', be.data_primeiro_contato), 'YYYY-MM') mes,
         e.nome especialidade,
         count(distinct be.cl_id) contatados
  from base_esp be
  join top_esp t on t.especialidade_id = be.especialidade_id
  join especialidades e on e.id = be.especialidade_id
  where be.status <> 'frio' and be.data_primeiro_contato is not null
  group by 1, 2
)
select json_build_object(
  'funil', (select json_build_object(
     'universo', (select count(distinct l.id) from leads l
        join lead_especialidades le on le.lead_id = l.id
        where (p_uf is null or l.uf = p_uf)
          and (p_especialidade_id is null or le.especialidade_id = p_especialidade_id)),
     'em_campanha', count(distinct lead_id),
     'contatados', count(distinct lead_id) filter (where status <> 'frio'),
     'em_conversa', count(distinct lead_id) filter (where status = 'em_conversa'),
     'quente', count(distinct lead_id) filter (where status = 'quente'),
     'convertido', count(distinct lead_id) filter (where status = 'convertido')
   ) from funil_rows),
  'coorte_mensal', coalesce((select json_agg(x order by x.mes) from (select mes, especialidade, contatados from coorte) x), '[]'),
  'especialidades_serie', coalesce((select json_agg(e.nome order by t.n desc) from top_esp t join especialidades e on e.id = t.especialidade_id), '[]'),
  'filtros', json_build_object(
     'ufs', coalesce((select json_agg(uf order by uf) from (select distinct uf from base where uf is not null and btrim(uf) <> '') u), '[]'),
     'especialidades', coalesce((select json_agg(json_build_object('id', id, 'nome', nome) order by nome) from (
        select distinct e.id, e.nome from base_esp b join especialidades e on e.id = b.especialidade_id) x), '[]')
  )
);
$fn$;
grant execute on function public.get_bi_prospec_funil(text, uuid) to authenticated, service_role, anon;
