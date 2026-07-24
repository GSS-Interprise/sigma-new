-- Snapshot durável do fluxo de entrada/processamento da IA. A queue é
-- transitória e não serve como métrica: itens saudáveis desaparecem após uso.
CREATE OR REPLACE FUNCTION public.bridge_ia_health_snapshot(
  p_since timestamptz,
  p_grace interval DEFAULT interval '2 minutes'
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH eligible AS (
  SELECT
    regexp_replace(sc.contact_phone, '\D', '', 'g') AS phone,
    max(sm.created_at) AS last_incoming
  FROM sigzap_messages sm
  JOIN sigzap_conversations conv ON conv.id = sm.conversation_id
  JOIN sigzap_contacts sc ON sc.id = conv.contact_id
  JOIN sigzap_instances si ON si.id = conv.instance_id
  JOIN chips ch ON ch.instance_name = si.name
  JOIN campanha_leads cl ON cl.lead_id = conv.lead_id
  JOIN campanhas ca ON ca.id = cl.campanha_id
  WHERE sm.from_me = false
    AND sm.created_at >= p_since
    AND sm.created_at <= now() - p_grace
    AND ca.status = 'ativa'
    AND ca.tipo_campanha = 'prospeccao'
    AND lower(coalesce(ca.tipo_envio, 'ia')) IN ('ia', 'ambos')
    AND cl.status IN ('contatado', 'sem_resposta', 'em_conversa', 'aquecido')
    AND coalesce(cl.humano_assumiu, false) = false
    AND coalesce(cl.aguarda_resposta_humana, false) = false
    AND (ca.chip_id = ch.id OR ch.id = ANY(coalesce(ca.chip_ids, '{}'::uuid[])))
  GROUP BY regexp_replace(sc.contact_phone, '\D', '', 'g')
),
processed AS (
  SELECT
    regexp_replace(phone, '\D', '', 'g') AS phone,
    max(claimed_at) FILTER (WHERE status IN ('processing', 'completed')) AS last_processed
  FROM campanha_ia_processed_messages
  WHERE claimed_at >= p_since - interval '1 minute'
  GROUP BY regexp_replace(phone, '\D', '', 'g')
),
coverage AS (
  SELECT
    e.phone,
    e.last_incoming,
    p.last_processed,
    coalesce(p.last_processed >= e.last_incoming - interval '30 seconds', false) AS covered
  FROM eligible e
  LEFT JOIN processed p USING (phone)
),
processing_stats AS (
  SELECT
    count(*) FILTER (WHERE status = 'completed') AS completed,
    count(*) FILTER (WHERE status = 'failed') AS failed,
    count(*) FILTER (
      WHERE status = 'processing'
        AND claimed_at < now() - interval '5 minutes'
    ) AS stuck
  FROM campanha_ia_processed_messages
  WHERE claimed_at >= p_since
)
SELECT jsonb_build_object(
  'eligible_phones', (SELECT count(*) FROM coverage),
  'covered_phones', (SELECT count(*) FROM coverage WHERE covered),
  'missing_phones', (SELECT count(*) FROM coverage WHERE NOT covered),
  'missing_samples', coalesce((
    SELECT jsonb_agg(phone ORDER BY last_incoming DESC)
    FROM (
      SELECT phone, last_incoming
      FROM coverage
      WHERE NOT covered
      ORDER BY last_incoming DESC
      LIMIT 5
    ) samples
  ), '[]'::jsonb),
  'completed', (SELECT completed FROM processing_stats),
  'failed', (SELECT failed FROM processing_stats),
  'stuck', (SELECT stuck FROM processing_stats)
);
$function$;

REVOKE ALL ON FUNCTION public.bridge_ia_health_snapshot(timestamptz, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bridge_ia_health_snapshot(timestamptz, interval) TO service_role;

COMMENT ON FUNCTION public.bridge_ia_health_snapshot(timestamptz, interval) IS
  'Cobertura durável do bridge por telefone elegível, tolerando batching de mensagens.';
