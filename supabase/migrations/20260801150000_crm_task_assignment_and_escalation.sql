-- Escalonamento visual e captura atômica da próxima ação da fila da equipe.
CREATE OR REPLACE VIEW public.vw_campanha_tasks_operacional AS
SELECT dashboard.*,
  CASE
    WHEN dashboard.situacao IN ('feita', 'descartada', 'campanha_pausada', 'snoozed') THEN dashboard.situacao
    WHEN dashboard.prazo_at::date < current_date THEN 'atrasada'
    WHEN dashboard.prazo_at::date = current_date THEN 'hoje'
    WHEN dashboard.prazo_at > now() THEN 'futura'
    ELSE 'pendente'
  END AS situacao_operacional,
  greatest(0, floor(extract(epoch FROM (now() - dashboard.prazo_at)) / 3600))::integer AS horas_atraso,
  CASE WHEN dashboard.prazo_at >= now() THEN 'no_prazo'
    WHEN dashboard.prazo_at >= now() - interval '24 hours' THEN 'atencao' ELSE 'vencido' END AS sla_status,
  CASE
    WHEN dashboard.prioridade_operacional = 'urgente' AND dashboard.prazo_at < now() - interval '30 minutes' THEN true
    WHEN dashboard.prioridade_operacional <> 'urgente' AND dashboard.prazo_at < now() - interval '24 hours' THEN true
    ELSE false
  END AS alerta_coordenacao
FROM public.vw_campanha_tasks_dashboard dashboard;

GRANT SELECT ON public.vw_campanha_tasks_operacional TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_crm_task_capacity_by_owner AS
SELECT
  task.responsavel_id,
  coalesce(task.responsavel_nome, 'Fila da equipe') AS responsavel_nome,
  count(*) FILTER (WHERE task.is_next_action) AS fila_total,
  count(*) FILTER (WHERE task.is_next_action AND task.dentro_capacidade_diaria) AS fila_priorizada,
  count(*) FILTER (WHERE task.is_next_action AND task.situacao_operacional = 'atrasada') AS sla_vencido,
  count(*) FILTER (WHERE task.is_next_action AND task.prioridade_operacional = 'urgente') AS urgentes,
  count(*) FILTER (WHERE task.is_next_action AND task.alerta_coordenacao) AS alertas_coordenacao,
  count(*) FILTER (WHERE task.status::text = 'feita' AND task.feita_em::date = current_date) AS concluidas_hoje
FROM public.vw_campanha_tasks_operacional task
GROUP BY task.responsavel_id, task.responsavel_nome;

GRANT SELECT ON public.vw_crm_task_capacity_by_owner TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_assumir_proxima_acao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_campanha_lead_id uuid;
  v_lead_id uuid;
  v_task_id uuid;
  v_fila_atual integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;

  SELECT count(*) INTO v_fila_atual
  FROM public.vw_campanha_tasks_dashboard
  WHERE is_next_action AND responsavel_id = v_uid;

  IF v_fila_atual >= 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'capacidade_atingida', 'fila_atual', v_fila_atual);
  END IF;

  SELECT cl.id, cl.lead_id, candidate.task_id
    INTO v_campanha_lead_id, v_lead_id, v_task_id
  FROM public.campanha_leads cl
  JOIN public.vw_campanha_tasks_dashboard candidate ON candidate.campanha_lead_id = cl.id
  WHERE candidate.is_next_action
    AND candidate.responsavel_id IS NULL
    AND candidate.campanha_status <> 'pausada'
  ORDER BY
    CASE candidate.prioridade_operacional WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 ELSE 3 END,
    candidate.prazo_at NULLS FIRST,
    candidate.task_id
  FOR UPDATE OF cl SKIP LOCKED
  LIMIT 1;

  IF v_campanha_lead_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fila_vazia');
  END IF;

  UPDATE public.campanha_leads
     SET assumido_por = v_uid,
         assumido_em = now(),
         humano_assumiu = true,
         updated_at = now()
   WHERE id = v_campanha_lead_id;

  RETURN jsonb_build_object(
    'ok', true,
    'campanha_lead_id', v_campanha_lead_id,
    'lead_id', v_lead_id,
    'task_id', v_task_id,
    'fila_anterior', v_fila_atual,
    'ia_pausada', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_assumir_proxima_acao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_assumir_proxima_acao() TO authenticated, service_role;
COMMENT ON FUNCTION public.crm_assumir_proxima_acao() IS
  'Entrega atomicamente o lead mais urgente da fila da equipe ao usuário autenticado, respeitando capacidade de 60.';
