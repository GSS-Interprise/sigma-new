
ALTER TABLE public.sigzap_conversations 
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_lead_id ON public.sigzap_conversations(lead_id);

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.leads
  WHERE phone_e164 = p_phone
     OR p_phone = ANY(telefones_adicionais)
  LIMIT 1;
$$;
