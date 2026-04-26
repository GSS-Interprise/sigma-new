-- View que deriva a origem de cada conversa do SIG Zap
-- Prioridade: manual > tráfego pago > disparo em massa > inbound

CREATE OR REPLACE VIEW public.vw_sigzap_conversation_origem
WITH (security_invoker = true)
AS
WITH conv AS (
  SELECT
    c.id AS conversation_id,
    c.lead_id,
    ct.contact_phone,
    -- Normaliza telefone para casar com phone_e164 (que tem '+')
    CASE
      WHEN ct.contact_phone IS NULL OR ct.contact_phone = '' THEN NULL
      WHEN left(ct.contact_phone, 1) = '+' THEN ct.contact_phone
      ELSE '+' || regexp_replace(ct.contact_phone, '\D', '', 'g')
    END AS phone_e164_norm
  FROM public.sigzap_conversations c
  LEFT JOIN public.sigzap_contacts ct ON ct.id = c.contact_id
),
manual AS (
  SELECT DISTINCT ON (cv.conversation_id)
    cv.conversation_id,
    dm.created_at AS evento_at,
    dm.campanha_proposta_id
  FROM conv cv
  JOIN public.disparo_manual_envios dm
    ON (cv.lead_id IS NOT NULL AND dm.lead_id = cv.lead_id)
    OR (cv.phone_e164_norm IS NOT NULL AND dm.phone_e164 = cv.phone_e164_norm)
  ORDER BY cv.conversation_id, dm.created_at DESC
),
trafego AS (
  SELECT DISTINCT ON (cv.conversation_id)
    cv.conversation_id,
    tp.enviado_em AS evento_at,
    tp.campanha_proposta_id
  FROM conv cv
  JOIN public.trafego_pago_envios tp
    ON (cv.lead_id IS NOT NULL AND tp.lead_id = cv.lead_id)
    OR (cv.phone_e164_norm IS NOT NULL AND tp.telefone_enviado = cv.phone_e164_norm)
  ORDER BY cv.conversation_id, tp.enviado_em DESC
),
massa AS (
  SELECT DISTINCT ON (cv.conversation_id)
    cv.conversation_id,
    dc.data_envio AS evento_at,
    dc.campanha_proposta_id
  FROM conv cv
  JOIN public.disparos_contatos dc
    ON (cv.lead_id IS NOT NULL AND dc.lead_id = cv.lead_id)
    OR (cv.phone_e164_norm IS NOT NULL AND dc.telefone_e164 = cv.phone_e164_norm)
  WHERE dc.status IN ('4-ENVIADO','5-RESPONDEU','2-ENVIADO')
  ORDER BY cv.conversation_id, dc.data_envio DESC
),
unioned AS (
  SELECT conversation_id, 'manual'::text AS origem, evento_at, campanha_proposta_id, 1 AS prio FROM manual
  UNION ALL
  SELECT conversation_id, 'trafego_pago'::text, evento_at, campanha_proposta_id, 2 FROM trafego
  UNION ALL
  SELECT conversation_id, 'massa'::text, evento_at, campanha_proposta_id, 3 FROM massa
),
ranked AS (
  SELECT DISTINCT ON (conversation_id)
    conversation_id, origem, evento_at, campanha_proposta_id
  FROM unioned
  ORDER BY conversation_id, prio ASC, evento_at DESC NULLS LAST
)
SELECT
  cv.conversation_id,
  COALESCE(r.origem, 'inbound') AS origem,
  r.evento_at AS ultimo_envio_at,
  r.campanha_proposta_id,
  cmp.nome AS campanha_nome
FROM conv cv
LEFT JOIN ranked r ON r.conversation_id = cv.conversation_id
LEFT JOIN public.campanha_propostas cp ON cp.id = r.campanha_proposta_id
LEFT JOIN public.campanhas cmp ON cmp.id = cp.campanha_id;

GRANT SELECT ON public.vw_sigzap_conversation_origem TO authenticated;