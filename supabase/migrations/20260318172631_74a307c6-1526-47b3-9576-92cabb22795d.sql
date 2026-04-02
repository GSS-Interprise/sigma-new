
CREATE INDEX IF NOT EXISTS idx_leads_cpf_digits 
ON public.leads (REGEXP_REPLACE(cpf, '\D', '', 'g'))
WHERE cpf IS NOT NULL;
