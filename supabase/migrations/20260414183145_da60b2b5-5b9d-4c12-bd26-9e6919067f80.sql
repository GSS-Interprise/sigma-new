ALTER TABLE public.sigzap_conversations 
  ADD COLUMN IF NOT EXISTS not_the_doctor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS not_the_doctor_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS not_the_doctor_by UUID;