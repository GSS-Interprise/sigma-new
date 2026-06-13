-- Produtividade por captadora (pessoa) — base do painel "Produtividade da Equipe" (Bloco 4)
-- e do bloco 7 da aba Prospecção do BI Diretoria (Frente C).
--
-- Consolida 1 linha por usuário a partir das fontes que JÁ são preenchidas hoje
-- (disparos em massa, manuais, conversões) + acompanhamento por lead.
--
-- ATENÇÃO: campanha_leads.assumido_por está preenchido em ~5/14k linhas (write-path
-- manual ainda não carimba). As métricas de acompanhamento (assumidos/convertidos_campanha/
-- horas_medias_fechamento) crescem conforme a equipe usa "assumir/responder" no card (B2.1).
-- conversoes_totais (leads.convertido_por) já é preenchido — use-o pra não ficar zerado.

create or replace view public.vw_captadora_produtividade as
with disp as (
  select responsavel_id as user_id,
         count(*)                       as campanhas_massa,
         coalesce(sum(enviados), 0)     as massa_enviados
  from disparos_campanhas
  where responsavel_id is not null
  group by responsavel_id
),
man as (
  select enviado_por as user_id,
         count(*) filter (where status = 'enviado') as manuais_enviados
  from disparo_manual_envios
  where enviado_por is not null
  group by enviado_por
),
acomp as (
  select assumido_por as user_id,
         count(*)                                              as leads_assumidos,
         count(*) filter (where status = 'convertido')         as convertidos_campanha,
         count(*) filter (where status = 'descartado'
                             or resultado_final = 'perdido')   as perdidos,
         count(*) filter (where status in ('em_conversa','aquecido','quente')) as em_andamento,
         avg(extract(epoch from (data_status
               - coalesce(assumido_em, data_primeiro_contato, created_at))) / 3600.0)
           filter (where status = 'convertido')                as horas_medias_fechamento
  from campanha_leads
  where assumido_por is not null
  group by assumido_por
),
conv as (
  select convertido_por as user_id,
         count(*) as conversoes_totais
  from leads
  where convertido_por is not null
    and status = 'convertido'
  group by convertido_por
)
select
  p.id                                              as user_id,
  p.nome_completo,
  coalesce(d.campanhas_massa, 0)                    as campanhas_massa,
  coalesce(d.massa_enviados, 0)                     as massa_enviados,
  coalesce(m.manuais_enviados, 0)                   as manuais_enviados,
  coalesce(a.leads_assumidos, 0)                    as leads_assumidos,
  coalesce(a.convertidos_campanha, 0)              as convertidos_campanha,
  coalesce(a.perdidos, 0)                           as perdidos,
  coalesce(a.em_andamento, 0)                       as em_andamento,
  round(a.horas_medias_fechamento::numeric, 1)     as horas_medias_fechamento,
  coalesce(c.conversoes_totais, 0)                  as conversoes_totais,
  case when coalesce(a.leads_assumidos, 0) > 0
       then round(100.0 * coalesce(a.convertidos_campanha, 0) / a.leads_assumidos, 1)
       else 0 end                                   as taxa_conversao_pct
from profiles p
left join disp  d on d.user_id  = p.id
left join man   m on m.user_id  = p.id
left join acomp a on a.user_id  = p.id
left join conv  c on c.user_id  = p.id
where (coalesce(d.campanhas_massa, 0)
     + coalesce(m.manuais_enviados, 0)
     + coalesce(a.leads_assumidos, 0)
     + coalesce(c.conversoes_totais, 0)) > 0;

grant select on public.vw_captadora_produtividade to authenticated, service_role;

comment on view public.vw_captadora_produtividade is
  'Produtividade por captadora (Bloco 4 / BI Diretoria). Métricas de acompanhamento dependem do carimbo de assumido_por (B2.1).';
