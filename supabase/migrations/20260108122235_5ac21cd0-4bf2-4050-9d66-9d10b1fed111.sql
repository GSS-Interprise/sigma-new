-- Adicionar campo lead_id na tabela disparos_contatos para rastreabilidade
ALTER TABLE public.disparos_contatos 
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Criar índice para buscas por lead
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_lead_id ON public.disparos_contatos(lead_id);

-- Comentário explicativo
COMMENT ON COLUMN public.disparos_contatos.lead_id IS 'Referência ao lead original para rastreabilidade no histórico do prontuário';