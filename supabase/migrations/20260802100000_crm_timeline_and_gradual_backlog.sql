ALTER TABLE public.campanha_lead_tasks
  ADD COLUMN IF NOT EXISTS backlog_legado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_ativado_em timestamptz DEFAULT now();

UPDATE public.campanha_lead_tasks SET backlog_legado = true, sla_ativado_em = NULL
WHERE status::text IN ('pendente', 'snooze');

CREATE OR REPLACE FUNCTION public.crm_ativar_sla_vagas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ativadas integer;
BEGIN
  UPDATE public.campanha_lead_tasks task SET sla_ativado_em = now()
  FROM public.vw_campanha_tasks_dashboard fila
  WHERE fila.task_id = task.id AND fila.is_next_action AND fila.dentro_capacidade_diaria
    AND task.backlog_legado AND task.sla_ativado_em IS NULL;
  GET DIAGNOSTICS v_ativadas = ROW_COUNT;
  RETURN v_ativadas;
END; $$;
REVOKE ALL ON FUNCTION public.crm_ativar_sla_vagas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ativar_sla_vagas() TO service_role;

CREATE OR REPLACE FUNCTION public.tg_task_activate_next_sla_slot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.crm_ativar_sla_vagas();
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_task_activate_next_sla_slot ON public.campanha_lead_tasks;
CREATE TRIGGER trg_task_activate_next_sla_slot
AFTER UPDATE OF status, responsavel_id ON public.campanha_lead_tasks
FOR EACH STATEMENT EXECUTE FUNCTION public.tg_task_activate_next_sla_slot();

SELECT public.crm_ativar_sla_vagas();

CREATE OR REPLACE VIEW public.vw_campanha_tasks_operacional AS
SELECT dashboard.*,
  CASE
    WHEN dashboard.situacao IN ('feita', 'descartada', 'campanha_pausada', 'snoozed') THEN dashboard.situacao
    WHEN task.backlog_legado AND task.sla_ativado_em IS NULL THEN 'futura'
    WHEN deadline.sla_prazo_at::date < current_date THEN 'atrasada'
    WHEN deadline.sla_prazo_at::date = current_date THEN 'hoje'
    WHEN deadline.sla_prazo_at > now() THEN 'futura' ELSE 'pendente' END AS situacao_operacional,
  CASE WHEN deadline.sla_prazo_at IS NULL THEN 0
    ELSE greatest(0, floor(extract(epoch FROM (now() - deadline.sla_prazo_at)) / 3600))::integer END AS horas_atraso,
  CASE WHEN task.backlog_legado AND task.sla_ativado_em IS NULL THEN 'aguardando_capacidade'
    WHEN deadline.sla_prazo_at >= now() THEN 'no_prazo'
    WHEN deadline.sla_prazo_at >= now() - interval '24 hours' THEN 'atencao' ELSE 'vencido' END AS sla_status,
  CASE WHEN deadline.sla_prazo_at IS NULL THEN false
    WHEN deadline.sla_prazo_at < now() THEN true ELSE false END AS alerta_coordenacao,
  task.backlog_legado, task.sla_ativado_em, deadline.sla_prazo_at
FROM public.vw_campanha_tasks_dashboard dashboard
JOIN public.campanha_lead_tasks task ON task.id = dashboard.task_id
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN task.backlog_legado AND task.sla_ativado_em IS NULL THEN NULL::timestamptz
    WHEN task.backlog_legado AND dashboard.prioridade_operacional = 'urgente' THEN task.sla_ativado_em + interval '30 minutes'
    WHEN task.backlog_legado THEN task.sla_ativado_em + interval '24 hours'
    ELSE dashboard.prazo_at END AS sla_prazo_at
) deadline;
GRANT SELECT ON public.vw_campanha_tasks_operacional TO authenticated, service_role;

CREATE OR REPLACE VIEW public.vw_lead_timeline AS
SELECT lh.lead_id, lh.criado_em AS ts, 'historico'::text AS origem, lh.tipo_evento::text AS tipo,
  CASE WHEN lh.usuario_id IS NOT NULL THEN 'humano'::text ELSE 'sistema'::text END AS operador,
  NULL::text AS canal, coalesce(lh.descricao_resumida, '') AS conteudo, lh.metadados
FROM public.lead_historico lh WHERE lh.lead_id IS NOT NULL
UNION ALL
SELECT cl.lead_id, (msg.value->>'ts')::timestamptz, 'campanha_ia'::text, 'mensagem'::text,
  CASE WHEN msg.value->>'role' = 'medico' THEN 'lead' WHEN msg.value->>'role' = 'gss' THEN 'ia'
    ELSE coalesce(msg.value->>'role', 'desconhecido') END,
  'whatsapp'::text, msg.value->>'text',
  jsonb_build_object('campanha_id', cl.campanha_id, 'campanha_lead_id', cl.id, 'status', cl.status)
FROM public.campanha_leads cl,
LATERAL jsonb_array_elements(coalesce(cl.historico_conversa, '[]'::jsonb)) msg(value)
WHERE cl.lead_id IS NOT NULL
UNION ALL
SELECT sc.lead_id, coalesce(sm.sent_at, sm.created_at), 'conversa_manual'::text,
  coalesce(sm.message_type, 'mensagem'), CASE WHEN sm.from_me THEN 'humano' ELSE 'lead' END,
  'whatsapp'::text, coalesce(sm.message_text, sm.media_caption, '[midia]'),
  jsonb_build_object('conversation_id', sm.conversation_id, 'instance', sm.sent_via_instance_name, 'message_status', sm.message_status)
FROM public.sigzap_messages sm JOIN public.sigzap_conversations sc ON sc.id = sm.conversation_id
WHERE sc.lead_id IS NOT NULL
UNION ALL
SELECT cl.lead_id, history.created_at, 'funil'::text, 'mudanca_etapa'::text,
  CASE WHEN history.alterado_por IS NULL THEN 'sistema' ELSE 'humano' END,
  NULL::text, history.motivo,
  jsonb_build_object('campanha_id', cl.campanha_id, 'campanha_lead_id', cl.id,
    'etapa_anterior', history.etapa_anterior, 'etapa_nova', history.etapa_nova, 'alterado_por', history.alterado_por)
FROM public.campanha_lead_stage_history history
JOIN public.campanha_leads cl ON cl.id = history.campanha_lead_id;
GRANT SELECT ON public.vw_lead_timeline TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_ativar_sla_vagas() IS
  'Inicia o SLA do backlog legado somente quando a próxima ação entra na capacidade diária.';
