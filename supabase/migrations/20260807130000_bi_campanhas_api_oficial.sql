CREATE OR REPLACE FUNCTION public.get_bi_campanhas_api_oficial(
  p_inicio timestamptz,
  p_fim timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean;
  v_result jsonb;
BEGIN
  v_can_view := public.is_admin(v_uid) OR public.has_permission(v_uid, 'captacao', 'view');
  IF NOT v_can_view THEN
    RAISE EXCEPTION 'Sem permissão para visualizar BI de campanhas oficiais' USING ERRCODE = '42501';
  END IF;

  WITH
  primeiros AS (
    SELECT cl.id, cl.campanha_id, cl.lead_id, cl.data_primeiro_contato
    FROM public.campanha_leads cl
    JOIN public.campanhas c ON c.id = cl.campanha_id
    WHERE c.whatsapp_provider = 'twilio'
      AND cl.data_primeiro_contato >= p_inicio
      AND cl.data_primeiro_contato < p_fim
      AND cl.status <> 'frio'
  ),
  leads_oficiais AS (
    SELECT DISTINCT lead_id
    FROM primeiros
    WHERE lead_id IS NOT NULL
  ),
  outbound AS (
    SELECT DISTINCT
      sm.id,
      sm.message_status,
      sm.sent_by_user_id
    FROM public.sigzap_messages sm
    JOIN public.sigzap_conversations sc ON sc.id = sm.conversation_id
    JOIN leads_oficiais lo ON lo.lead_id = sc.lead_id
    WHERE sm.from_me = true
      AND sm.provider = 'twilio'
      AND sm.sent_at >= p_inicio
      AND sm.sent_at < p_fim
  ),
  resumo AS (
    SELECT
      (SELECT COUNT(*) FROM primeiros) AS primeiros_contatos,
      (SELECT COUNT(*) FROM outbound) AS mensagens_outbound,
      (SELECT COUNT(*) FROM outbound WHERE sent_by_user_id IS NULL) AS mensagens_automaticas,
      (SELECT COUNT(*) FROM outbound WHERE sent_by_user_id IS NOT NULL) AS mensagens_equipe,
      (SELECT COUNT(*) FROM outbound WHERE message_status IN ('delivered', 'read')) AS entregues,
      (SELECT COUNT(*) FROM outbound WHERE message_status = 'read') AS lidas,
      (SELECT COUNT(*) FROM outbound WHERE message_status IN ('queued', 'accepted', 'sending', 'sent')) AS pendentes,
      (SELECT COUNT(*) FROM outbound WHERE message_status IN ('undelivered', 'failed', 'error')) AS nao_entregues,
      (SELECT COUNT(DISTINCT campanha_id) FROM primeiros) AS campanhas
  )
  SELECT jsonb_build_object(
    'primeiros_contatos', r.primeiros_contatos,
    'mensagens_outbound', r.mensagens_outbound,
    'continuacoes_ia', GREATEST(r.mensagens_automaticas - r.primeiros_contatos, 0),
    'mensagens_equipe', r.mensagens_equipe,
    'entregues', r.entregues,
    'lidas', r.lidas,
    'pendentes', r.pendentes,
    'nao_entregues', r.nao_entregues,
    'campanhas', r.campanhas,
    'cap_diario', (
      SELECT COALESCE(SUM(COALESCE(c.limite_diario_campanha, 0)), 0)
      FROM public.campanhas c
      WHERE c.whatsapp_provider = 'twilio'
        AND c.status = 'ativa'
    )
  )
  INTO v_result
  FROM resumo r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bi_campanhas_api_oficial(timestamptz, timestamptz)
  TO authenticated;
