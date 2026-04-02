-- Drop the old constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add updated constraint with all status values
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
CHECK (status = ANY (ARRAY[
  'Novo'::text, 
  'Qualificado'::text, 
  'Convertido'::text, 
  'Descartado'::text,
  'Acompanhamento'::text,
  'Em Resposta'::text,
  'Proposta Enviada'::text,
  'Proposta Aceita'::text,
  'Proposta Recusada'::text
]));