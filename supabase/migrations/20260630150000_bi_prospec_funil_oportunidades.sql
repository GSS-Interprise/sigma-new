-- Prospecção v2 (30/06): funil real + MAPA DE OPORTUNIDADES.
-- Além do funil filtrável (universo→campanha→contatado→conversa→quente→convertido),
-- devolve as maiores oportunidades = médicos ainda NÃO contatados. Dimensão adapta:
--   sem especialidade selecionada → oportunidades POR ESPECIALIDADE (onde atacar)
--   com especialidade selecionada → oportunidades POR ESTADO (onde, no Brasil, atacá-la)
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
funil_rows as (
  select distinct cl_id, lead_id, status, data_primeiro_contato
  from base_esp
  where (p_especialidade_id is null or especialidade_id = p_especialidade_id)
),
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
         e.nome especialidade, count(distinct be.cl_id) contatados
  from base_esp be
  join top_esp t on t.especialidade_id = be.especialidade_id
  join especialidades e on e.id = be.especialidade_id
  where be.status <> 'frio' and be.data_primeiro_contato is not null
  group by 1, 2
),
-- === Oportunidades: universo × contatados, dimensão especialidade OU estado ===
op_universo as (
  select (case when p_especialidade_id is null then le.especialidade_id::text else l.uf end) k,
         count(distinct le.lead_id) universo
  from lead_especialidades le join leads l on l.id = le.lead_id
  where (p_uf is null or l.uf = p_uf)
    and (p_especialidade_id is null or le.especialidade_id = p_especialidade_id)
    and (p_especialidade_id is not null or true)
    and (case when p_especialidade_id is null then le.especialidade_id::text else nullif(btrim(l.uf), '') end) is not null
  group by 1
),
op_cont as (
  select (case when p_especialidade_id is null then le.especialidade_id::text else l.uf end) k,
         count(distinct cl.lead_id) contatados
  from campanha_leads cl
  join leads l on l.id = cl.lead_id
  join lead_especialidades le on le.lead_id = cl.lead_id
  where cl.status <> 'frio'
    and (p_uf is null or l.uf = p_uf)
    and (p_especialidade_id is null or le.especialidade_id = p_especialidade_id)
  group by 1
),
op as (
  select u.k, u.universo, coalesce(c.contatados, 0) contatados,
    u.universo - coalesce(c.contatados, 0) gap,
    round(100.0 * coalesce(c.contatados, 0) / nullif(u.universo, 0)) cobertura_pct
  from op_universo u left join op_cont c on c.k = u.k
  order by gap desc limit 15
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
  'oportunidades', json_build_object(
     'dimensao', case when p_especialidade_id is null then 'especialidade' else 'estado' end,
     'linhas', coalesce((select json_agg(json_build_object(
        'rotulo', case when p_especialidade_id is null then (select nome from especialidades e where e.id::text = op.k) else op.k end,
        'universo', universo, 'contatados', contatados, 'gap', gap, 'cobertura_pct', cobertura_pct
       ) order by gap desc) from op), '[]')
  ),
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
