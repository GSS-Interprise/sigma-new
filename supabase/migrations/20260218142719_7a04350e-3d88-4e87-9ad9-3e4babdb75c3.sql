-- Add unique constraint on 'name' column for sigzap_instances
-- This is needed for the upsert in receive-whatsapp-messages edge function
ALTER TABLE public.sigzap_instances ADD CONSTRAINT sigzap_instances_name_key UNIQUE (name);