-- Runtime foundation for official WhatsApp. Keep SQL literals ASCII-only.

CREATE TABLE IF NOT EXISTS public.whatsapp_official_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider = 'twilio'),
  sender_sid text NOT NULL UNIQUE,
  phone_e164 text NOT NULL,
  display_name text,
  status text NOT NULL DEFAULT 'unknown',
  quality_rating text,
  messaging_service_sid text,
  webhook_url text,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_official_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read official senders"
  ON public.whatsapp_official_senders;
CREATE POLICY "Authenticated users read official senders"
ON public.whatsapp_official_senders
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins manage official senders"
  ON public.whatsapp_official_senders;
CREATE POLICY "Admins manage official senders"
ON public.whatsapp_official_senders
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.whatsapp_official_senders TO authenticated;
GRANT ALL ON public.whatsapp_official_senders TO service_role;

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS official_sender_id uuid
    REFERENCES public.whatsapp_official_senders(id) ON DELETE SET NULL;

ALTER TABLE public.sigzap_instances
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution'
    CHECK (provider IN ('evolution', 'twilio')),
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sigzap_instances_provider_external
  ON public.sigzap_instances(provider, external_ref)
  WHERE external_ref IS NOT NULL;

ALTER TABLE public.sigzap_messages
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'evolution'
    CHECK (provider IN ('evolution', 'twilio')),
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_error_code text,
  ADD COLUMN IF NOT EXISTS provider_error_message text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sigzap_messages_provider_message
  ON public.sigzap_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.sigzap_conversations
  ADD COLUMN IF NOT EXISTS service_window_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_official_senders_phone
  ON public.whatsapp_official_senders(phone_e164);

COMMENT ON TABLE public.whatsapp_official_senders IS
  'Approved WhatsApp senders available through Twilio.';
COMMENT ON COLUMN public.sigzap_conversations.service_window_expires_at IS
  'End of the 24-hour free-form service window opened by the latest inbound message.';
