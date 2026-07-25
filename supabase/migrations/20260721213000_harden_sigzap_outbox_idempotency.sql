-- Um indice parcial nao pode ser inferido pelo ON CONFLICT do PostgREST.
-- UNIQUE comum continua permitindo multiplos NULLs e torna o upsert idempotente.
DROP INDEX IF EXISTS public.uq_sigzap_messages_client_message_id;
CREATE UNIQUE INDEX uq_sigzap_messages_client_message_id
  ON public.sigzap_messages (client_message_id);

-- Persistir a confirmacao externa antes de materializar o historico impede
-- reenvio ao WhatsApp caso apenas a escrita seguinte falhe.
ALTER TABLE public.sigzap_outbox
  ADD COLUMN IF NOT EXISTS evolution_response jsonb;

-- Recupera recibos dos itens que ja haviam sido aceitos pela Evolution antes
-- desta protecao. A janela curta seleciona o envio original, nao os retries.
WITH matched AS (
  SELECT o.id AS outbox_id, o.client_message_id, o.conversation_id,
         o.message_text, o.message_type, o.created_by, o.instance_name,
         l.evolution_response, l.evolution_response->'key'->>'id' AS wa_message_id,
         l.sent_at
  FROM public.sigzap_outbox o
  JOIN LATERAL (
    SELECT log.evolution_response, log.sent_at
    FROM public.chip_send_log log
    WHERE log.chip_id = o.chip_id
      AND regexp_replace(log.to_jid, '\D', '', 'g') = regexp_replace(o.contact_jid, '\D', '', 'g')
      AND log.status = 'sent'
      AND log.sent_at >= o.created_at
      AND log.sent_at <= o.created_at + interval '5 minutes'
    ORDER BY log.sent_at
    LIMIT 1
  ) l ON true
  WHERE o.status IN ('queued', 'processing')
    AND o.last_error_code = 'WORKER_ERROR'
)
INSERT INTO public.sigzap_messages (
  conversation_id, client_message_id, wa_message_id, from_me, message_text,
  message_type, message_status, raw_payload, sent_at, sent_by_user_id,
  sent_via_instance_name
)
SELECT conversation_id, client_message_id, wa_message_id, true, message_text,
       message_type, 'sent', evolution_response, sent_at, created_by, instance_name
FROM matched
ON CONFLICT (client_message_id) DO NOTHING;

WITH matched AS (
  SELECT o.id AS outbox_id, m.id AS message_id, m.wa_message_id,
         m.raw_payload, m.sent_at
  FROM public.sigzap_outbox o
  JOIN public.sigzap_messages m ON m.client_message_id = o.client_message_id
  WHERE o.status IN ('queued', 'processing')
    AND o.last_error_code = 'WORKER_ERROR'
)
UPDATE public.sigzap_outbox o
SET status = 'sent', wa_message_id = matched.wa_message_id,
    evolution_response = matched.raw_payload, sigzap_message_id = matched.message_id,
    sent_at = matched.sent_at, updated_at = now(),
    last_error_code = null, last_error_detail = null
FROM matched
WHERE o.id = matched.outbox_id;
