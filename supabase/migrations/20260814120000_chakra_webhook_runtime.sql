-- Runtime metadata for Chakra webhook automation.
-- The webhook is configured at plugin level by Chakra, while Sigma keeps an
-- explicit phone allow-list so other numbers in the same Chakra plan are not
-- imported into this operation.

ALTER TABLE public.whatsapp_chakra_connections
  ADD COLUMN IF NOT EXISTS webhook_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_configured_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event_type text,
  ADD COLUMN IF NOT EXISTS last_webhook_error text;

CREATE TABLE IF NOT EXISTS public.whatsapp_chakra_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text,
  phone_number_id text,
  event_type text NOT NULL,
  event_hash text NOT NULL UNIQUE,
  processing_status text NOT NULL DEFAULT 'received',
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_chakra_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read Chakra webhook events"
  ON public.whatsapp_chakra_webhook_events;
CREATE POLICY "Authenticated users read Chakra webhook events"
ON public.whatsapp_chakra_webhook_events
FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.whatsapp_chakra_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_chakra_webhook_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_chakra_webhook_events_phone_received
  ON public.whatsapp_chakra_webhook_events(phone_number_id, received_at DESC);

COMMENT ON COLUMN public.whatsapp_chakra_connections.webhook_configured IS
  'Indica se o plugin Chakra foi configurado para enviar eventos ao endpoint do Sigma.';
COMMENT ON TABLE public.whatsapp_chakra_webhook_events IS
  'Auditoria idempotente dos eventos recebidos do Chakra; o telefone só é processado quando existe em whatsapp_chakra_connections.';
