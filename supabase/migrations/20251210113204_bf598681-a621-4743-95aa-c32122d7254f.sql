-- Add approval fields for "Corpo Médico" conversion
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS aprovacao_contrato_assinado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS aprovacao_documentacao_unidade boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS aprovacao_cadastro_unidade boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_aprovacao_corpo_medico timestamp with time zone,
ADD COLUMN IF NOT EXISTS aprovado_corpo_medico_por uuid;