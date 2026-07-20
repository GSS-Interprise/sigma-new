-- =====================================================================
-- pncp_cobertura_medir — mede cobertura Effecti × espelho numa janela.
--
-- Toda a lógica (parse do título, resolução IBGE, casamento) vive aqui e
-- não na edge: a edge fazia 3 RPCs por linha (~120 idas ao banco por
-- execução). Aqui é uma query só, e dá pra auditar o número rodando o
-- mesmo SQL à mão — foi assim que os defeitos do critério antigo
-- apareceram.
--
-- Buckets (ver pncp_casa_effecti_ibge para a semântica exata):
--   casado/provavel  → coberto (numerador)
--   incerto          → município no PNCP, número não achado (revisar)
--   ausente          → município sem NADA no espelho (fonte externa?)
--   nao_resolvido    → município não resolve pro IBGE (fora do denominador)
-- =====================================================================

alter table licitacao_cobertura_diaria add column if not exists incertos_amostra jsonb;

create or replace function pncp_cobertura_medir(p_desde date)
returns jsonb
language sql stable security definer set search_path to 'public' as $$
with base as (
  select id, titulo, municipio_uf, subtipo_modalidade,
         regexp_replace(titulo, '^.* - ', '') as sufixo
    from licitacoes
   where fonte = 'n8n' and titulo is not null and created_at >= p_desde
),
cand as (
  select b.*,
    nullif(trim(regexp_replace(coalesce(municipio_uf,''), '\s*[-/]\s*[A-Za-z]{2}$', '')), '') as mun_campo,
    case when municipio_uf ~ '[-/]\s*[A-Za-z]{2}$' then upper(right(trim(municipio_uf), 2)) end as uf_campo,
    nullif(trim(split_part(sufixo, '/', 1)), '') as mun_tit,
    nullif(trim(split_part(sufixo, '/', 2)), '') as uf_tit,
    case subtipo_modalidade
      when 'Pregão Eletrônico' then 6  when 'Pregão Presencial' then 7
      when 'Credenciamento'    then 12 when 'Concorrência'      then 4
      when 'Dispensa'          then 8  when 'Inexigibilidade'   then 9
      when 'Concurso'          then 3  when 'Edital de Chamamento' then 12
      when 'Leilão'            then 1  else null end as mod_id
  from base b
),
num as (
  -- "DL 24/2026"→24/2026 ; "DL 3312026"→331/2026 ; "PE 30"→30/sem ano
  select c.*,
    coalesce((regexp_match(titulo, '(\d+)\s*/\s*(\d{4})'))[1],
             (regexp_match(titulo, '\y(\d{1,6})(20\d{2})\y'))[1],
             (regexp_match(titulo, '\y[A-Za-z]{2,5}\s+(\d+)\y'))[1]) as p_num,
    coalesce((regexp_match(titulo, '(\d+)\s*/\s*(\d{4})'))[2],
             (regexp_match(titulo, '\y(\d{1,6})(20\d{2})\y'))[2])::int as p_ano
  from cand c
),
res as (
  select n.*, rc.codigo_ibge as ic, rt.codigo_ibge as it
    from num n
    left join lateral resolve_municipio_ibge(n.mun_campo, n.uf_campo) rc on true
    left join lateral resolve_municipio_ibge(n.mun_tit,   n.uf_tit)   rt on true
),
v as (
  -- campo e título divergem em ~5% e nenhum é autoridade → manda os dois
  -- como candidatos e deixa o número do edital desempatar
  select r.titulo,
    pncp_casa_effecti_ibge(
      (select array_agg(distinct x) from unnest(array[r.ic, r.it]) x where x is not null),
      r.p_num, r.mod_id, r.p_ano, p_desde
    ) as veredito
  from res r
),
t as (
  select
    count(*)                                          as total,
    count(*) filter (where veredito = 'casado')       as casados,
    count(*) filter (where veredito = 'provavel')     as provaveis,
    count(*) filter (where veredito = 'incerto')      as incertos,
    count(*) filter (where veredito = 'ausente')      as ausentes,
    count(*) filter (where veredito = 'nao_resolvido') as nao_resolvidos
  from v
)
select jsonb_build_object(
  'total_effecti', t.total,
  'casados',       t.casados,
  'provaveis',     t.provaveis,
  'incertos',      t.incertos,
  'ausentes',      t.ausentes,
  'sem_parse',     t.nao_resolvidos,
  'pct_cobertura', case when (t.total - t.nao_resolvidos) > 0
      then round(((t.casados + t.provaveis)::numeric / (t.total - t.nao_resolvidos)) * 100, 1)
      else null end,
  'ausentes_amostra', coalesce((select jsonb_agg(titulo) from (
      select titulo from v where veredito = 'ausente' limit 25) a), '[]'::jsonb),
  'incertos_amostra', coalesce((select jsonb_agg(titulo) from (
      select titulo from v where veredito = 'incerto' limit 25) b), '[]'::jsonb)
) from t
$$;

grant execute on function pncp_cobertura_medir(date) to authenticated, service_role;
