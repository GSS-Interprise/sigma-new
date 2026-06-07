-- Dashboard Fase 1: série temporal de disparos por dia (BRT).
-- A vw_campanhas_dashboard só tem snapshots (hoje/24h/7d) — sem isso não há
-- filtro de período, gráfico por dia nem comparação. Fonte: data_primeiro_contato
-- (mesma do cap anti-ban). Dia em America/Sao_Paulo pra "hoje" bater com o fuso BR.
create or replace view public.vw_disparos_diarios as
select
  (cl.data_primeiro_contato at time zone 'America/Sao_Paulo')::date as dia,
  cl.campanha_id,
  c.nome as campanha_nome,
  c.tipo_envio,
  c.regiao_estado,
  c.especialidade_id,
  count(*) as n_disparos
from public.campanha_leads cl
join public.campanhas c on c.id = cl.campanha_id
where cl.data_primeiro_contato is not null
group by 1, 2, 3, 4, 5, 6;

grant select on public.vw_disparos_diarios to authenticated, service_role;
