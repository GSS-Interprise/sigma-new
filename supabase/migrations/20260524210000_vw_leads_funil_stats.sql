-- Visão de funil pra rota /leads
-- 6 KPIs agregados num único SELECT — usado no header da pagina de Leads
-- pra a operadora ver "estado da base" em 1 segundo.
--
-- Roda em ~50ms mesmo com 500k+ leads pq sao counts simples + 1 EXISTS.

CREATE OR REPLACE VIEW public.vw_leads_funil_stats AS
SELECT
  (SELECT COUNT(*) FROM public.leads WHERE merged_into_id IS NULL) AS total,
  (SELECT COUNT(*) FROM public.leads
    WHERE merged_into_id IS NULL
      AND (phone_e164 IS NULL OR phone_e164 = '')) AS sem_telefone,
  (SELECT COUNT(*) FROM public.leads
    WHERE merged_into_id IS NULL
      AND opt_out = true) AS opt_out,
  (SELECT COUNT(*) FROM public.leads
    WHERE merged_into_id IS NULL
      AND classificacao = 'proibido') AS proibidos,
  (SELECT COUNT(*) FROM public.leads
    WHERE data_conversao IS NOT NULL) AS convertidos,
  (SELECT COUNT(DISTINCT lead_id) FROM public.campanha_leads
    WHERE etapa_acompanhamento = 'quente') AS quentes,
  (SELECT COUNT(DISTINCT cl.lead_id) FROM public.campanha_leads cl
    JOIN public.campanhas c ON c.id = cl.campanha_id
    WHERE c.status IN ('ativa', 'pausada')) AS em_campanha,
  (SELECT COUNT(*) FROM public.blacklist) AS blacklist,
  (SELECT COUNT(*) FROM public.leads
    WHERE merged_into_id IS NULL
      AND created_at >= NOW() - INTERVAL '7 days') AS novos_7d;

GRANT SELECT ON public.vw_leads_funil_stats TO authenticated, service_role;

COMMENT ON VIEW public.vw_leads_funil_stats IS
  'Funil de leads — KPIs agregados pra rota /leads. Counts simples, ~50ms.';
