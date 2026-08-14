-- Chakra WhatsApp Coexistence: official channel metadata and provider support.
-- Secrets and access tokens stay in Edge Functions; this table stores only
-- identifiers/status returned by the provider.

CREATE TABLE IF NOT EXISTS public.whatsapp_chakra_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL,
  waba_id text,
  phone_number_id text NOT NULL UNIQUE,
  phone_e164 text,
  display_name text,
  status text NOT NULL DEFAULT 'pending',
  quality_rating text,
  messaging_limit_tier text,
  name_status text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_chakra_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read Chakra connections"
  ON public.whatsapp_chakra_connections;
CREATE POLICY "Authenticated users read Chakra connections"
ON public.whatsapp_chakra_connections
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage Chakra connections"
  ON public.whatsapp_chakra_connections;
CREATE POLICY "Admins manage Chakra connections"
ON public.whatsapp_chakra_connections
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.whatsapp_chakra_connections TO authenticated;
GRANT ALL ON public.whatsapp_chakra_connections TO service_role;

ALTER TABLE public.whatsapp_official_senders
  DROP CONSTRAINT IF EXISTS whatsapp_official_senders_provider_check;
ALTER TABLE public.whatsapp_official_senders
  ADD CONSTRAINT whatsapp_official_senders_provider_check
  CHECK (provider IN ('twilio', 'chakra'));
ALTER TABLE public.whatsapp_official_senders
  ADD COLUMN IF NOT EXISTS chakra_connection_id uuid
    REFERENCES public.whatsapp_chakra_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chakra_plugin_id text,
  ADD COLUMN IF NOT EXISTS chakra_waba_id text,
  ADD COLUMN IF NOT EXISTS chakra_phone_number_id text,
  ADD COLUMN IF NOT EXISTS messaging_limit_tier text,
  ADD COLUMN IF NOT EXISTS name_status text;

ALTER TABLE public.whatsapp_official_templates
  DROP CONSTRAINT IF EXISTS whatsapp_official_templates_provider_check;
ALTER TABLE public.whatsapp_official_templates
  ADD CONSTRAINT whatsapp_official_templates_provider_check
  CHECK (provider IN ('twilio', 'chakra'));

ALTER TABLE public.campanhas
  DROP CONSTRAINT IF EXISTS campanhas_whatsapp_provider_check;
ALTER TABLE public.campanhas
  ADD CONSTRAINT campanhas_whatsapp_provider_check
  CHECK (whatsapp_provider IN ('evolution', 'twilio', 'chakra'));

ALTER TABLE public.sigzap_instances
  DROP CONSTRAINT IF EXISTS sigzap_instances_provider_check;
ALTER TABLE public.sigzap_instances
  ADD CONSTRAINT sigzap_instances_provider_check
  CHECK (provider IN ('evolution', 'twilio', 'chakra'));

ALTER TABLE public.sigzap_messages
  DROP CONSTRAINT IF EXISTS sigzap_messages_provider_check;
ALTER TABLE public.sigzap_messages
  ADD CONSTRAINT sigzap_messages_provider_check
  CHECK (provider IN ('evolution', 'twilio', 'chakra'));

CREATE INDEX IF NOT EXISTS idx_chakra_connections_plugin
  ON public.whatsapp_chakra_connections(plugin_id);
CREATE INDEX IF NOT EXISTS idx_official_senders_chakra_phone
  ON public.whatsapp_official_senders(chakra_phone_number_id)
  WHERE provider = 'chakra';
