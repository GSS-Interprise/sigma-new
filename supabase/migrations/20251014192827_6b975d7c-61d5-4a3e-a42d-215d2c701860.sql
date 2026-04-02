-- Adicionar coluna para armazenar números de RQE (Registro de Qualificação de Especialista)
-- Usando array de texto pois médicos especialistas podem ter múltiplos RQEs
ALTER TABLE public.medicos 
ADD COLUMN rqe_numeros text[] DEFAULT NULL;

COMMENT ON COLUMN public.medicos.rqe_numeros IS 'Números de RQE do médico. Campo opcional, usado apenas para especialistas.';