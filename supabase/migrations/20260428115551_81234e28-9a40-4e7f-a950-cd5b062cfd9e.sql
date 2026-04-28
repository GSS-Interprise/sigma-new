CREATE OR REPLACE FUNCTION public.get_bi_prospec_dashboard(p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean;
  v_result jsonb;
BEGIN
  v_can_view := public.is_admin(v_uid) OR public.has_permission(v_uid, 'captacao', 'view');
  IF NOT v_can_view THEN
    RAISE EXCEPTION 'Sem permissão para visualizar BI Prospec' USING ERRCODE = '42501';
  END IF;

  WITH
  massa AS (
    SELECT lead_id, status, data_envio
    FROM public.disparos_contatos
    WHERE data_envio >= p_inicio AND data_envio <= p_fim
      AND status = '4-ENVIADO'
  ),
  massa_status_full AS (
    SELECT status, COUNT(*) AS qt
    FROM public.disparos_contatos
    WHERE COALESCE(data_envio, created_at) >= p_inicio
      AND COALESCE(data_envio, created_at) <= p_fim
    GROUP BY status
  ),
  -- Manuais: registros explicitos (botao Disparo Manual) + mensagens humanas no chat SIG Zap
  manuais_dme AS (
    SELECT lead_id, created_at
    FROM public.disparo_manual_envios
    WHERE created_at >= p_inicio AND created_at <= p_fim
  ),
  manuais_chat AS (
    SELECT c.lead_id, m.sent_at AS created_at
    FROM public.sigzap_messages m
    JOIN public.sigzap_conversations c ON c.id = m.conversation_id
    WHERE m.from_me = true
      AND m.sent_by_user_id IS NOT NULL
      AND m.sent_at >= p_inicio AND m.sent_at <= p_fim
  ),
  manuais AS (
    SELECT lead_id, created_at FROM manuais_dme
    UNION ALL
    SELECT lead_id, created_at FROM manuais_chat
  ),
  emails_enviados AS (
    SELECT lead_id, created_at
    FROM public.email_interacoes
    WHERE created_at >= p_inicio AND created_at <= p_fim
      AND direcao = 'enviado'
  ),
  emails_recebidos AS (
    SELECT lead_id
    FROM public.email_interacoes
    WHERE created_at >= p_inicio AND created_at <= p_fim
      AND direcao = 'recebido'
      AND lead_id IS NOT NULL
  ),
  canais AS (
    SELECT lead_id, canal, status_final, motivo_saida, saiu_em, created_at
    FROM public.campanha_proposta_lead_canais
    WHERE created_at >= p_inicio AND created_at <= p_fim
  ),
  trafego AS (
    SELECT *
    FROM public.vw_trafego_pago_funil
    WHERE primeiro_envio >= p_inicio AND primeiro_envio <= p_fim
      AND COALESCE(total_enviados, 0) > 0
  ),
  trafego_totais AS (
    SELECT
      COALESCE(SUM(total_enviados), 0)     AS enviados,
      COALESCE(SUM(total_responderam), 0)  AS responderam,
      COALESCE(SUM(total_em_conversa), 0)  AS em_conversa,
      COALESCE(SUM(total_aceitaram), 0)    AS aceitaram,
      COALESCE(SUM(total_convertidos), 0)  AS convertidos
    FROM trafego
  ),
  conv AS (
    SELECT id, especialidade, convertido_por, data_conversao
    FROM public.leads
    WHERE data_conversao >= p_inicio AND data_conversao <= p_fim
  ),
  lead_ids AS (
    SELECT lead_id FROM massa WHERE lead_id IS NOT NULL
    UNION
    SELECT lead_id FROM manuais WHERE lead_id IS NOT NULL
    UNION
    SELECT lead_id FROM emails_enviados WHERE lead_id IS NOT NULL
    UNION
    SELECT lead_id FROM canais WHERE lead_id IS NOT NULL
    UNION
    SELECT id FROM conv
  ),
  lead_esp AS (
    SELECT l.id, COALESCE(NULLIF(TRIM(l.especialidade), ''), 'Sem especialidade') AS especialidade
    FROM public.leads l
    WHERE l.id IN (SELECT lead_id FROM lead_ids WHERE lead_id IS NOT NULL)
  ),
  responderam AS (
    SELECT lead_id FROM emails_recebidos
    UNION
    SELECT lead_id FROM canais
      WHERE lead_id IS NOT NULL
        AND status_final IN ('respondeu', 'aceitou', 'convertido', 'em_conversa')
  ),
  convertidos_geral AS (
    SELECT id AS lead_id FROM conv
    UNION
    SELECT lead_id FROM canais WHERE status_final = 'convertido' AND lead_id IS NOT NULL
  ),
  canal_wpp AS (
    SELECT lead_id FROM massa WHERE lead_id IS NOT NULL
    UNION ALL
    SELECT lead_id FROM manuais WHERE lead_id IS NOT NULL
  ),
  canal_wpp_agg AS (
    SELECT
      (SELECT COUNT(*) FROM canal_wpp) AS enviados,
      (SELECT COUNT(DISTINCT cw.lead_id) FROM canal_wpp cw WHERE cw.lead_id IN (SELECT lead_id FROM responderam)) AS responderam,
      (SELECT COUNT(DISTINCT cw.lead_id) FROM canal_wpp cw WHERE cw.lead_id IN (SELECT lead_id FROM convertidos_geral)) AS convertidos
  ),
  canal_email_agg AS (
    SELECT
      (SELECT COUNT(*) FROM emails_enviados) AS enviados,
      (SELECT COUNT(DISTINCT ee.lead_id) FROM emails_enviados ee WHERE ee.lead_id IN (SELECT lead_id FROM responderam)) AS responderam,
      (SELECT COUNT(DISTINCT ee.lead_id) FROM emails_enviados ee WHERE ee.lead_id IN (SELECT lead_id FROM convertidos_geral)) AS convertidos
  ),
  canal_ig AS (
    SELECT lead_id FROM canais WHERE canal = 'instagram'
  ),
  canal_ig_agg AS (
    SELECT
      (SELECT COUNT(*) FROM canal_ig) AS enviados,
      (SELECT COUNT(DISTINCT ci.lead_id) FROM canal_ig ci WHERE ci.lead_id IN (SELECT lead_id FROM responderam)) AS responderam,
      (SELECT COUNT(DISTINCT ci.lead_id) FROM canal_ig ci WHERE ci.lead_id IN (SELECT lead_id FROM convertidos_geral)) AS convertidos
  ),
  disparos_unificados AS (
    SELECT lead_id FROM massa
    UNION ALL
    SELECT lead_id FROM manuais
    UNION ALL
    SELECT lead_id FROM emails_enviados
    UNION ALL
    SELECT lead_id FROM canais
  ),
  por_esp AS (
    SELECT
      COALESCE(le.especialidade, 'Sem especialidade') AS especialidade,
      COUNT(*) AS disparos,
      COUNT(DISTINCT CASE WHEN du.lead_id IN (SELECT lead_id FROM responderam) THEN du.lead_id END) AS responderam,
      COUNT(DISTINCT CASE WHEN du.lead_id IN (SELECT lead_id FROM convertidos_geral) THEN du.lead_id END) AS convertidos
    FROM disparos_unificados du
    LEFT JOIN lead_esp le ON le.id = du.lead_id
    GROUP BY 1
    ORDER BY disparos DESC
    LIMIT 15
  ),
  por_colab AS (
    SELECT
      COALESCE(c.convertido_por::text, 'sem_responsavel') AS id,
      COALESCE(p.nome_completo, CASE WHEN c.convertido_por IS NULL THEN '— Sem responsável' ELSE 'Usuário desconhecido' END) AS nome,
      COUNT(*) AS total
    FROM conv c
    LEFT JOIN public.profiles p ON p.id = c.convertido_por
    GROUP BY 1, 2
    ORDER BY total DESC
  ),
  motivos AS (
    SELECT COALESCE(NULLIF(TRIM(motivo_saida), ''), 'Sem motivo informado') AS motivo, COUNT(*) AS total
    FROM canais
    WHERE status_final IN ('descartado', 'fechado', 'proposta_encerrada', 'nao_respondeu')
    GROUP BY 1
    ORDER BY total DESC
  ),
  evolucao AS (
    SELECT mes, SUM(manual) AS manual, SUM(massa) AS massa, SUM(trafego) AS trafego, SUM(respostas) AS respostas, SUM(convertidos) AS convertidos
    FROM (
      SELECT to_char(created_at, 'YYYY-MM') AS mes, 1 AS manual, 0 AS massa, 0 AS trafego, 0 AS respostas, 0 AS convertidos FROM manuais
      UNION ALL
      SELECT to_char(data_envio, 'YYYY-MM') AS mes, 0, 1, 0, 0, 0 FROM massa
      UNION ALL
      SELECT to_char(primeiro_envio, 'YYYY-MM') AS mes, 0, 0, COALESCE(total_enviados,0)::int, COALESCE(total_responderam,0)::int, COALESCE(total_convertidos,0)::int FROM trafego
    ) sub
    GROUP BY mes
    ORDER BY mes
  ),
  top_camp AS (
    SELECT *
    FROM public.vw_campanha_metricas
    WHERE campanha_criada_em >= p_inicio AND campanha_criada_em <= p_fim
    ORDER BY convertidos DESC NULLS LAST
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'totais', jsonb_build_object(
      'manuais', (SELECT COUNT(*) FROM manuais),
      'massa_enviados', (SELECT COUNT(*) FROM massa),
      'massa_fila', (SELECT COALESCE(SUM(qt),0) FROM massa_status_full WHERE status = '1-ENVIAR'),
      'massa_falhas', (SELECT COALESCE(SUM(qt),0) FROM massa_status_full WHERE status IN ('5-NOZAP','6-BLOQUEADORA','3-ERRO','7-FALHA')),
      'massa_total_tentativas', (SELECT COALESCE(SUM(qt),0) FROM massa_status_full),
      'trafego_enviados', (SELECT enviados FROM trafego_totais),
      'trafego_responderam', (SELECT responderam FROM trafego_totais),
      'trafego_em_conversa', (SELECT em_conversa FROM trafego_totais),
      'trafego_aceitaram', (SELECT aceitaram FROM trafego_totais),
      'trafego_convertidos', (SELECT convertidos FROM trafego_totais),
      'emails_enviados', (SELECT COUNT(*) FROM emails_enviados),
      'instagram_enviados', (SELECT COUNT(*) FROM canal_ig),
      'responderam_geral', (SELECT COUNT(*) FROM (SELECT DISTINCT lead_id FROM responderam) r),
      'convertidos_geral', (SELECT COUNT(*) FROM (SELECT DISTINCT lead_id FROM convertidos_geral) c)
    ),
    'massa_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status', status, 'qt', qt)), '[]'::jsonb) FROM massa_status_full),
    'por_canal', jsonb_build_object(
      'whatsapp', (SELECT to_jsonb(canal_wpp_agg) FROM canal_wpp_agg),
      'email', (SELECT to_jsonb(canal_email_agg) FROM canal_email_agg),
      'trafego', jsonb_build_object(
        'enviados', (SELECT enviados FROM trafego_totais),
        'responderam', (SELECT responderam FROM trafego_totais),
        'convertidos', (SELECT convertidos FROM trafego_totais)
      ),
      'instagram', (SELECT to_jsonb(canal_ig_agg) FROM canal_ig_agg)
    ),
    'por_especialidade', (SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM por_esp e),
    'por_colaborador', (SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM por_colab c),
    'motivos_nao_conversao', (SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb) FROM motivos m),
    'evolucao_mensal', (SELECT COALESCE(jsonb_agg(to_jsonb(ev)), '[]'::jsonb) FROM evolucao ev),
    'top_campanhas', (SELECT COALESCE(jsonb_agg(to_jsonb(tc)), '[]'::jsonb) FROM top_camp tc),
    'top_propostas', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM (
      SELECT * FROM trafego ORDER BY total_convertidos DESC NULLS LAST LIMIT 8
    ) t),
    'propostas_trafego', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM trafego t),
    'gerado_em', now()
  ) INTO v_result;

  RETURN v_result;
END;
$function$;