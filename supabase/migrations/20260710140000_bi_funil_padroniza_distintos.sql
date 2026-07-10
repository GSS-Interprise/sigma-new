-- FIX BI (auditoria diretoria): padronizar o TOPO do funil pra "MEDICOS DISTINTOS,
-- incluindo os sem especialidade classificada". Antes divergia:
--   AbaProspec "Em campanha 15.074"  = distinct lead_id SO com especialidade (INNER JOIN)
--   Engajamento "Na campanha 20.292" = count(*) de linhas campanha_lead (dup por campanha)
-- Alvo unico: count(distinct lead_id) de todos em campanha = 15.231.

-- (1) get_bi_prospec_funil: o funil principal passa a contar de TODOS os leads em campanha
-- (base) quando nao ha filtro de especialidade; com filtro, so os daquela especialidade.
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
  -- Sem filtro de especialidade: TODOS os leads em campanha (inclui sem especialidade).
  -- Com filtro: so os leads daquela especialidade.
  select distinct b.cl_id, b.lead_id, b.status, b.data_primeiro_contato
  from base b
  where p_especialidade_id is null
     or exists (select 1 from lead_especialidades le where le.lead_id = b.lead_id and le.especialidade_id = p_especialidade_id)
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
op_universo as (
  select (case when p_especialidade_id is null then especialidade_id::text else uf end) k, sum(n) universo
  from public.mv_especialidade_uf_universo
  where (p_uf is null or uf = p_uf)
    and (p_especialidade_id is null or especialidade_id = p_especialidade_id)
    and (p_especialidade_id is null or uf <> '??')
  group by 1
),
op_cont as (
  select (case when p_especialidade_id is null then le.especialidade_id::text else l.uf end) k,
         count(distinct cl.lead_id) contatados
  from campanha_leads cl join leads l on l.id = cl.lead_id join lead_especialidades le on le.lead_id = cl.lead_id
  where cl.status <> 'frio' and (p_uf is null or l.uf = p_uf) and (p_especialidade_id is null or le.especialidade_id = p_especialidade_id)
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
     'base_total', (select count(*) from leads l where (p_uf is null or l.uf = p_uf)),
     'universo', case when p_especialidade_id is null then
          (select coalesce(sum(n), 0) from mv_uf_universo where (p_uf is null or uf = p_uf))
        else
          (select coalesce(sum(n), 0) from mv_especialidade_uf_universo where especialidade_id = p_especialidade_id and (p_uf is null or uf = p_uf))
        end,
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

-- (2) get_bi_funil_engajamento: todas as etapas por lead_id DISTINTO (converge com o topo).
create or replace function public.get_bi_funil_engajamento(
  p_campanha_id uuid default null,
  p_data_ini date default null,
  p_data_fim date default null
) returns jsonb language sql stable security definer set search_path = public as $$
  with base as (
    select cl.lead_id, cl.status, cl.data_primeiro_contato
    from public.campanha_leads cl
    where (p_campanha_id is null or cl.campanha_id = p_campanha_id)
      and (p_data_ini is null or cl.created_at::date >= p_data_ini)
      and (p_data_fim is null or cl.created_at::date <= p_data_fim)
  )
  select jsonb_build_object(
    'na_campanha',  count(distinct lead_id),
    'frio',         count(distinct lead_id) filter (where status = 'frio'),
    'contatados',   count(distinct lead_id) filter (where status <> 'frio' or data_primeiro_contato is not null),
    'responderam',  count(distinct lead_id) filter (where status in ('em_conversa','quente','convertido')),
    'perfil_ia',    count(distinct lead_id) filter (where lead_id in (select lead_id from public.banco_interesse_leads)),
    'quente',       count(distinct lead_id) filter (where status in ('quente','convertido')),
    'convertido',   count(distinct lead_id) filter (where status = 'convertido'),
    'descartado',   count(distinct lead_id) filter (where status = 'descartado'),
    'sem_resposta', count(distinct lead_id) filter (where status = 'sem_resposta')
  )
  from base;
$$;
grant execute on function public.get_bi_funil_engajamento(uuid, date, date) to authenticated, service_role;

-- (3) reprocessa o snapshot que a tela default lê
select public.refresh_bi_prospec_funil_snapshot();
