CREATE TABLE IF NOT EXISTS public.whatsapp_official_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider = 'twilio'),
  content_sid text NOT NULL UNIQUE,
  friendly_name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  content_type text NOT NULL DEFAULT 'twilio/text',
  body text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status text NOT NULL DEFAULT 'unsubmitted',
  rejection_reason text,
  twilio_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_official_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read official templates" ON public.whatsapp_official_templates;
CREATE POLICY "Authenticated users read official templates"
ON public.whatsapp_official_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage official templates" ON public.whatsapp_official_templates;
CREATE POLICY "Admins manage official templates"
ON public.whatsapp_official_templates FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.whatsapp_official_templates TO authenticated;
GRANT ALL ON public.whatsapp_official_templates TO service_role;

CREATE INDEX IF NOT EXISTS idx_whatsapp_official_templates_status
  ON public.whatsapp_official_templates(approval_status, category);

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'evolution'
    CHECK (whatsapp_provider IN ('evolution', 'twilio')),
  ADD COLUMN IF NOT EXISTS official_template_id uuid
    REFERENCES public.whatsapp_official_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.campanhas.whatsapp_provider IS
  'Transporte do WhatsApp: evolution (nao oficial) ou twilio (API oficial).';
COMMENT ON TABLE public.whatsapp_official_templates IS
  'Espelho local dos templates da Twilio Content API e do status de aprovacao WhatsApp.';
