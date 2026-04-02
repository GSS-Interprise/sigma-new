-- Adicionar campo CPF na tabela medicos
ALTER TABLE public.medicos
ADD COLUMN cpf text UNIQUE;

COMMENT ON COLUMN public.medicos.cpf IS 'CPF do médico (11 dígitos, apenas números)';

-- Criar índice para CPF
CREATE INDEX idx_medicos_cpf ON public.medicos(cpf);