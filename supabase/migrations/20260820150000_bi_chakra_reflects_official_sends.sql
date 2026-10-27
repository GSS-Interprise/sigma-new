-- Faz o BI considerar o canal oficial Chakra da mesma forma que o Twilio.
-- O disparo oficial fica em sigzap_messages; chip_send_log é exclusivo do
-- fluxo Evolution e, por isso, não pode ser a única fonte do painel.

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
    WHERE c.whatsapp_provider IN ('twilio', 'chakra')
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
      AND sm.provider IN ('twilio', 'chakra')
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
      WHERE c.whatsapp_provider IN ('twilio', 'chakra')
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

CREATE OR REPLACE FUNCTION public.get_bi_acompanhamento_campanhas(p_desde date default null::date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH disp AS (
  -- Evolution: registro histórico do envio do chip.
  SELECT sent_at AS ts,
    CASE WHEN evento_origem IN ('cold_disparo','resposta_ia') THEN 'ia' ELSE 'manual' END AS origem
  FROM chip_send_log
  WHERE sent_at IS NOT NULL

  UNION ALL

  -- Oficial (Twilio/Chakra): mensagem efetivamente criada no Sigma.
  SELECT sm.sent_at AS ts,
    CASE WHEN sm.sent_by_user_id IS NULL THEN 'ia' ELSE 'manual' END AS origem
  FROM sigzap_messages sm
  WHERE sm.from_me = true
    AND sm.provider IN ('twilio', 'chakra')
    AND sm.sent_at IS NOT NULL
),
funil AS (
  SELECT campanha_id,
    count(*) leads,
    count(*) FILTER (WHERE status = 'frio') frio,
    count(*) FILTER (WHERE status <> 'frio') contatados,
    count(*) FILTER (WHERE status = 'em_conversa') em_conversa,
    count(*) FILTER (WHERE status = 'quente') quente,
    count(*) FILTER (WHERE status = 'convertido') convertido,
    max(data_ultimo_contato) ultima_atividade,
    count(*) FILTER (WHERE data_ultimo_contato::date = current_date) contatados_hoje,
    count(*) FILTER (WHERE data_ultimo_contato >= now() - interval '7 days') contatados_7d
  FROM campanha_leads GROUP BY campanha_id
),
camp AS (
  SELECT c.id, c.nome, c.tipo_envio, c.status,
    c.whatsapp_provider,
    (c.whatsapp_provider IN ('twilio', 'chakra')
      AND c.official_sender_id IS NOT NULL
      AND c.official_template_id IS NOT NULL) AS canal_configurado,
    coalesce(c.chip_ids, CASE WHEN c.chip_id IS NOT NULL THEN array[c.chip_id] ELSE '{}'::uuid[] END) chips_arr
  FROM campanhas c WHERE c.status IN ('ativa','pausada')
),
linhas AS (
  SELECT cp.id campanha_id, cp.nome campanha, cp.tipo_envio tipo, cp.status,
    cp.whatsapp_provider, cp.canal_configurado,
    coalesce(f.contatados_hoje,0) disparos_hoje,
    coalesce(f.contatados_7d,0) disparos_7d,
    coalesce(f.contatados,0) disparos_total,
    f.ultima_atividade ultimo_disparo,
    coalesce(f.leads,0) leads, coalesce(f.frio,0) frio, coalesce(f.contatados,0) contatados,
    coalesce(f.em_conversa,0) em_conversa, coalesce(f.quente,0) quente, coalesce(f.convertido,0) convertido,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0 ELSE coalesce(array_length(cp.chips_arr,1),0) END chips_total,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0
      ELSE (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open')
    END chips_online
  FROM camp cp LEFT JOIN funil f ON f.campanha_id = cp.id
)
SELECT json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'periodo', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where (p_desde is null or ts::date >= p_desde)),
  'resumo', (select json_build_object(
     'ativas', count(*) filter(where status='ativa'),
     'pausadas', count(*) filter(where status='pausada'),
     'rodando_hoje', count(*) filter(where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter(where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter(where status='ativa' and (whatsapp_provider is null or whatsapp_provider = 'evolution') and chips_online = 0)
   ) from linhas),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter(where origem='ia') ia, count(*) filter(where origem='manual') manual, count(*) total
     from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$function$;

GRANT EXECUTE ON FUNCTION public.get_bi_acompanhamento_campanhas(date) TO authenticated;
