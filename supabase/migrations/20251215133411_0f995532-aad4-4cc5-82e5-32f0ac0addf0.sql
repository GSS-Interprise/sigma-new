
-- Migration aditiva para migração de médicos para leads
-- Adiciona colunas de rastreamento sem remover nada

-- 1. Coluna para rastrear origem da migração (unique para idempotência)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS migrado_de_medico_id uuid UNIQUE;

-- 2. Coluna para timestamp da migração
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS migrado_de_medico_em timestamp with time zone;

-- 3. Comentários para documentação
COMMENT ON COLUMN public.leads.migrado_de_medico_id IS 'ID do médico de origem quando migrado do MedicoDialog. Unique para garantir idempotência.';
COMMENT ON COLUMN public.leads.migrado_de_medico_em IS 'Data/hora da migração do MedicoDialog para LeadProntuarioDialog.';

-- 4. Index para performance nas consultas de migração
CREATE INDEX IF NOT EXISTS idx_leads_migrado_de_medico_id ON public.leads(migrado_de_medico_id) WHERE migrado_de_medico_id IS NOT NULL;
