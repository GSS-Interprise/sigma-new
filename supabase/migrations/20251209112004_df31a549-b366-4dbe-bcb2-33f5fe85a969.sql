-- Add additional phones field to support up to 5 contacts
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS telefones_adicionais text[] DEFAULT '{}';