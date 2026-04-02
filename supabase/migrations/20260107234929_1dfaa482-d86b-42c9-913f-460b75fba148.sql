-- Adicionar coluna proximo_envio para agendamento de lotes
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS proximo_envio TIMESTAMP WITH TIME ZONE;