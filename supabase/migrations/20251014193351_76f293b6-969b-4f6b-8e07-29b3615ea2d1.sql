-- Alterar coluna especialidade para aceitar múltiplas especialidades
-- Primeiro vamos criar uma coluna temporária com array
ALTER TABLE public.medicos 
ADD COLUMN especialidades text[] DEFAULT NULL;

-- Copiar dados existentes da coluna especialidade para especialidades como array
UPDATE public.medicos 
SET especialidades = ARRAY[especialidade] 
WHERE especialidade IS NOT NULL;

-- Remover a coluna antiga especialidade
ALTER TABLE public.medicos 
DROP COLUMN especialidade;

-- Renomear a nova coluna para especialidade
ALTER TABLE public.medicos 
RENAME COLUMN especialidades TO especialidade;

-- Adicionar constraint para garantir que não seja vazio se preenchido
ALTER TABLE public.medicos 
ADD CONSTRAINT medicos_especialidade_not_empty 
CHECK (especialidade IS NULL OR array_length(especialidade, 1) > 0);

COMMENT ON COLUMN public.medicos.especialidade IS 'Especialidades médicas do profissional. Campo obrigatório, permite múltiplas especialidades.';