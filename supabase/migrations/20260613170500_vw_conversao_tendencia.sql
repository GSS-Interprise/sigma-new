-- Tendência de conversão por dia (bloco 5 da aba Prospecção do BI Diretoria).
-- Indicador DIRECIONAL ("a máquina está melhorando?"): contatados vs convertidos por dia (BRT).
-- Não é coorte exata (convertido pode ter sido contatado em dia anterior); serve pra linha de tendência.

create or replace view public.vw_conversao_tendencia as
with por_dia as (
  select (data_primeiro_contato at time zone 'America/Sao_Paulo')::date as dia,
         count(*) as contatados
  from campanha_leads
  where data_primeiro_contato is not null
  group by 1
),
conv_dia as (
  select (data_status at time zone 'America/Sao_Paulo')::date as dia,
         count(*) as convertidos
  from campanha_leads
  where status = 'convertido' and data_status is not null
  group by 1
),
quente_dia as (
  select (data_status at time zone 'America/Sao_Paulo')::date as dia,
         count(*) as quentes
  from campanha_leads
  where status = 'quente' and data_status is not null
  group by 1
)
select
  coalesce(p.dia, c.dia, q.dia)            as dia,
  coalesce(p.contatados, 0)                as contatados,
  coalesce(q.quentes, 0)                   as quentes,
  coalesce(c.convertidos, 0)               as convertidos,
  case when coalesce(p.contatados, 0) > 0
       then round(100.0 * coalesce(c.convertidos, 0) / p.contatados, 1)
       else 0 end                          as taxa_conversao_pct
from por_dia p
full outer join conv_dia  c on c.dia = p.dia
full outer join quente_dia q on q.dia = coalesce(p.dia, c.dia)
order by 1;

grant select on public.vw_conversao_tendencia to authenticated, service_role;

comment on view public.vw_conversao_tendencia is
  'Tendência diária contatados/quentes/convertidos (BI Diretoria). Direcional, não-coorte.';
