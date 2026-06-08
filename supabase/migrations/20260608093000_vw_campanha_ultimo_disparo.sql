-- Aba Status: "está disparando agora?" — último disparo e última atividade por campanha.
-- Alimenta o indicador verde pulsante no StatusOperacionalPanel.
create or replace view public.vw_campanha_ultimo_disparo as
select
  campanha_id,
  max(data_primeiro_contato) as ultimo_disparo,
  max(data_ultimo_contato) as ultima_atividade
from public.campanha_leads
where data_primeiro_contato is not null
group by campanha_id;

grant select on public.vw_campanha_ultimo_disparo to authenticated, service_role;
