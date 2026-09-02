-- Preenche códigos que os eventos antigos do Chakra armazenaram em
-- errorContext.providerPayload, antes do webhook passar a normalizar o campo.
WITH failed_events AS (
  SELECT DISTINCT ON (payload->>'externalId')
    payload->>'externalId' AS external_id,
    payload->'errorContext'->'providerPayload'->>'code' AS error_code,
    COALESCE(
      payload->'errorContext'->'providerPayload'->>'title',
      payload->'errorContext'->'providerPayload'->>'message',
      payload->'errorContext'->>'message'
    ) AS error_message
  FROM public.whatsapp_chakra_webhook_events
  WHERE event_type = 'status'
    AND payload->>'deliveryStatus' = 'FAILED'
    AND payload->>'externalId' IS NOT NULL
  ORDER BY payload->>'externalId', received_at DESC
)
UPDATE public.sigzap_messages AS sm
SET provider_error_code = fe.error_code,
    provider_error_message = fe.error_message
FROM failed_events AS fe
WHERE (sm.wa_message_id = fe.external_id
    OR sm.raw_payload->>'whatsappMessageId' = fe.external_id)
  AND fe.error_code IS NOT NULL;

UPDATE public.campanha_leads AS cl
SET ultimo_erro_codigo = sm.provider_error_code,
    ultimo_erro_mensagem = sm.provider_error_message,
    erro_envio = sm.provider_error_code || ' · ' || sm.provider_error_message,
    updated_at = now()
FROM public.sigzap_messages AS sm
WHERE sm.campanha_lead_id = cl.id
  AND sm.message_status IN ('failed', 'undelivered')
  AND sm.provider_error_code IS NOT NULL
  AND cl.envio_status IN ('retry_wait', 'failed_permanent');
