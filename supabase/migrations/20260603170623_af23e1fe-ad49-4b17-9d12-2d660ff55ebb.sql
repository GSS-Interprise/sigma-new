ALTER TABLE public.lead_historico
  DROP CONSTRAINT IF EXISTS lead_historico_proposta_id_fkey;

ALTER TABLE public.lead_historico
  ADD CONSTRAINT lead_historico_proposta_id_fkey
  FOREIGN KEY (proposta_id) REFERENCES public.proposta(id) ON DELETE SET NULL;