-- Adicionar coluna email na tabela leads
ALTER TABLE public.leads 
ADD COLUMN email text;

-- Adicionar índice para melhor performance
CREATE INDEX idx_leads_email ON public.leads(email);

-- Adicionar comentário
COMMENT ON COLUMN public.leads.email IS 'E-mail do lead para campanhas por e-mail';