ALTER TABLE public.leads ADD COLUMN whatsapp_phones text[] DEFAULT '{}';
COMMENT ON COLUMN public.leads.whatsapp_phones IS 'Lista de telefones confirmados com WhatsApp';