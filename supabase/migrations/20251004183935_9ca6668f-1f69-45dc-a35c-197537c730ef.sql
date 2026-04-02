-- Adicionar campo gravidade na tabela relacionamento_medico
ALTER TABLE public.relacionamento_medico
ADD COLUMN gravidade text CHECK (gravidade IN ('baixa', 'media', 'alta', 'critica'));

-- Adicionar campo data_nascimento na tabela medicos para aniversários
ALTER TABLE public.medicos
ADD COLUMN data_nascimento date;

-- Criar índices para melhorar performance das consultas
CREATE INDEX idx_relacionamento_status ON public.relacionamento_medico(status);
CREATE INDEX idx_relacionamento_tipo ON public.relacionamento_medico(tipo_principal);
CREATE INDEX idx_medicos_data_nascimento ON public.medicos(data_nascimento);