-- Reconcilia envios comerciais confirmados pela Evolution que os processadores
-- antigos registraram apenas no chip_send_log, sem materializar no SigZap.
CREATE TEMP TABLE _sigzap_business_outbound ON COMMIT DROP AS
SELECT DISTINCT ON (i.id, l.evolution_response->'key'->>'id')
  i.id AS instance_id,
  c.instance_name,
  regexp_replace(l.to_jid, '\D', '', 'g') AS phone,
  regexp_replace(l.to_jid, '\D', '', 'g') || '@s.whatsapp.net' AS contact_jid,
  l.evolution_response->'key'->>'id' AS wa_message_id,
  l.evolution_response->'message'->>'conversation' AS message_text,
  l.evolution_response AS raw_payload,
  l.sent_at
FROM public.chip_send_log l
JOIN public.chips c ON c.id = l.chip_id
JOIN public.sigzap_instances i ON i.name = c.instance_name
WHERE l.status = 'sent'
  AND l.evento_origem IN ('cold_disparo', 'cadencia', 'resposta_ia', 'opt_out')
  AND l.evolution_response->'key'->>'id' IS NOT NULL
  AND l.evolution_response->'message'->>'conversation' IS NOT NULL
ORDER BY i.id, l.evolution_response->'key'->>'id', l.sent_at DESC;

INSERT INTO public.sigzap_contacts (instance_id, contact_jid, contact_phone)
SELECT DISTINCT instance_id, contact_jid, phone
FROM _sigzap_business_outbound
WHERE phone <> ''
ON CONFLICT (contact_jid, instance_id) DO UPDATE
SET contact_phone = EXCLUDED.contact_phone,
    updated_at = now();

INSERT INTO public.sigzap_conversations (instance_id, contact_id, status)
SELECT DISTINCT b.instance_id, c.id, 'open'
FROM _sigzap_business_outbound b
JOIN public.sigzap_contacts c
  ON c.instance_id = b.instance_id AND c.contact_jid = b.contact_jid
ON CONFLICT (contact_id, instance_id) DO NOTHING;

INSERT INTO public.sigzap_messages (
  conversation_id, wa_message_id, from_me, sender_jid, message_text,
  message_type, message_status, raw_payload, sent_at, sent_via_instance_name
)
SELECT
  conv.id, b.wa_message_id, true, b.contact_jid, b.message_text,
  'text', 'sent', b.raw_payload, b.sent_at, b.instance_name
FROM _sigzap_business_outbound b
JOIN public.sigzap_contacts c
  ON c.instance_id = b.instance_id AND c.contact_jid = b.contact_jid
JOIN public.sigzap_conversations conv
  ON conv.instance_id = b.instance_id AND conv.contact_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.sigzap_messages m
  WHERE m.conversation_id = conv.id AND m.wa_message_id = b.wa_message_id
);

WITH latest AS (
  SELECT DISTINCT ON (conv.id)
    conv.id AS conversation_id, b.message_text, b.sent_at
  FROM _sigzap_business_outbound b
  JOIN public.sigzap_contacts c
    ON c.instance_id = b.instance_id AND c.contact_jid = b.contact_jid
  JOIN public.sigzap_conversations conv
    ON conv.instance_id = b.instance_id AND conv.contact_id = c.id
  ORDER BY conv.id, b.sent_at DESC
)
UPDATE public.sigzap_conversations conv
SET last_message_text = latest.message_text,
    last_message_at = latest.sent_at,
    updated_at = now()
FROM latest
WHERE conv.id = latest.conversation_id
  AND (conv.last_message_at IS NULL OR conv.last_message_at <= latest.sent_at);
