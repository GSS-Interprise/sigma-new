-- Contagem REAL de leads por campanha (todos os status, inclui descartado/sem_resposta).
-- Os contadores denormalizados em campanhas (total_frio/contatado/...) NÃO incluem
-- descartado/sem_resposta, então o card da lista subcontava (ex: CNES importada mostrava
-- 4 de 58). Esta view dá o total verdadeiro pro card.

create or replace view public.vw_campanha_lead_counts as
select campanha_id, count(*)::int as total_leads
from public.campanha_leads
group by campanha_id;

grant select on public.vw_campanha_lead_counts to authenticated, service_role;
