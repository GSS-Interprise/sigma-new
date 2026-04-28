ALTER TABLE public.sigzap_messages
  ADD COLUMN IF NOT EXISTS is_forwarded boolean,
  ADD COLUMN IF NOT EXISTS forward_score integer,
  ADD COLUMN IF NOT EXISTS location_data jsonb,
  ADD COLUMN IF NOT EXISTS contact_data jsonb,
  ADD COLUMN IF NOT EXISTS quoted_message_type text,
  ADD COLUMN IF NOT EXISTS quoted_message_participant text;