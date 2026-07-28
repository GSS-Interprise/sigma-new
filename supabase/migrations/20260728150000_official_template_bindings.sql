-- Bind each official template variable to campaign and lead data.

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS official_template_variables jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campanhas.official_template_variables IS
  'Map of Twilio variable number to a literal value or a supported Sigma token.';
