-- Keep controlled runs bounded even when the one-shot table already exists.
ALTER TABLE public.campanha_dispatch_one_shots
  DROP CONSTRAINT IF EXISTS campanha_dispatch_one_shots_max_contacts_check;

ALTER TABLE public.campanha_dispatch_one_shots
  ADD CONSTRAINT campanha_dispatch_one_shots_max_contacts_check
  CHECK (max_contacts BETWEEN 1 AND 500);
