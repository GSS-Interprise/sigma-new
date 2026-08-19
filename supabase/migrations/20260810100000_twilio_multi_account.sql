-- Multi-account Twilio support. Secrets stay in Edge Functions; only an alias
-- is persisted so a campaign can select a sender from a specific subaccount.

ALTER TABLE public.whatsapp_official_senders
  ADD COLUMN IF NOT EXISTS twilio_account_key text NOT NULL DEFAULT 'principal';

ALTER TABLE public.whatsapp_official_templates
  ADD COLUMN IF NOT EXISTS twilio_account_key text NOT NULL DEFAULT 'principal';

ALTER TABLE public.sigzap_instances
  ADD COLUMN IF NOT EXISTS twilio_account_key text NOT NULL DEFAULT 'principal';

ALTER TABLE public.whatsapp_official_senders
  DROP CONSTRAINT IF EXISTS whatsapp_official_senders_twilio_account_key_chk;
ALTER TABLE public.whatsapp_official_senders
  ADD CONSTRAINT whatsapp_official_senders_twilio_account_key_chk
  CHECK (twilio_account_key ~ '^[a-z0-9_]+$');

ALTER TABLE public.whatsapp_official_templates
  DROP CONSTRAINT IF EXISTS whatsapp_official_templates_twilio_account_key_chk;
ALTER TABLE public.whatsapp_official_templates
  ADD CONSTRAINT whatsapp_official_templates_twilio_account_key_chk
  CHECK (twilio_account_key ~ '^[a-z0-9_]+$');

ALTER TABLE public.sigzap_instances
  DROP CONSTRAINT IF EXISTS sigzap_instances_twilio_account_key_chk;
ALTER TABLE public.sigzap_instances
  ADD CONSTRAINT sigzap_instances_twilio_account_key_chk
  CHECK (twilio_account_key ~ '^[a-z0-9_]+$');

CREATE INDEX IF NOT EXISTS idx_official_senders_account_key
  ON public.whatsapp_official_senders (twilio_account_key);

CREATE INDEX IF NOT EXISTS idx_official_templates_account_key
  ON public.whatsapp_official_templates (twilio_account_key);
