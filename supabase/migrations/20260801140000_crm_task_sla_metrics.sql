-- Camada operacional de SLA. Mantém a view-base estável e corrige o intervalo
-- entre a virada do dia e 24 horas, que antes não aparecia como atraso.
CREATE OR REPLACE VIEW public.vw_campanha_tasks_operacional AS
SELECT dashboard.*,
  CASE
    WHEN dashboard.situacao IN ('feita', 'descartada', 'campanha_pausada', 'snoozed')
      THEN dashboard.situacao
    WHEN dashboard.prazo_at::date < current_date THEN 'atrasada'
    WHEN dashboard.prazo_at::date = current_date THEN 'hoje'
    WHEN dashboard.prazo_at > now() THEN 'futura'
    ELSE 'pendente'
  END AS situacao_operacional,
  greatest(0, floor(extract(epoch FROM (now() - dashboard.prazo_at)) / 3600))::integer AS horas_atraso,
  CASE
    WHEN dashboard.prazo_at >= now() THEN 'no_prazo'
    WHEN dashboard.prazo_at >= now() - interval '24 hours' THEN 'atencao'
    ELSE 'vencido'
  END AS sla_status
FROM public.vw_campanha_tasks_dashboard dashboard;

GRANT SELECT ON public.vw_campanha_tasks_operacional TO authenticated, service_role;
COMMENT ON VIEW public.vw_campanha_tasks_operacional IS
  'Fila de próximas ações com situação diária, horas de atraso e estado do SLA.';
