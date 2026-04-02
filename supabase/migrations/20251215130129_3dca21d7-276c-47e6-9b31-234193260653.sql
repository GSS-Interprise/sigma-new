-- Adiciona campos status_medico e status_contrato na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS status_medico TEXT DEFAULT 'Ativo',
ADD COLUMN IF NOT EXISTS status_contrato TEXT DEFAULT 'Ativo';