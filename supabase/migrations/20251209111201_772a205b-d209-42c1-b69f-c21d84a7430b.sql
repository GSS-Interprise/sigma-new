-- Add comprehensive lead fields for complete lead profile
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS rqe text,
ADD COLUMN IF NOT EXISTS nacionalidade text,
ADD COLUMN IF NOT EXISTS naturalidade text,
ADD COLUMN IF NOT EXISTS estado_civil text,
ADD COLUMN IF NOT EXISTS rg text,
ADD COLUMN IF NOT EXISTS endereco text,
ADD COLUMN IF NOT EXISTS cep text,
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS banco text,
ADD COLUMN IF NOT EXISTS agencia text,
ADD COLUMN IF NOT EXISTS conta_corrente text,
ADD COLUMN IF NOT EXISTS chave_pix text,
ADD COLUMN IF NOT EXISTS modalidade_contrato text,
ADD COLUMN IF NOT EXISTS local_prestacao_servico text,
ADD COLUMN IF NOT EXISTS data_inicio_contrato date,
ADD COLUMN IF NOT EXISTS valor_contrato numeric,
ADD COLUMN IF NOT EXISTS especificacoes_contrato text;