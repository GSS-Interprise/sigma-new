-- Adicionar coluna para armazenar destinatários no log de disparos
ALTER TABLE public.disparos_log 
ADD COLUMN IF NOT EXISTS destinatarios jsonb;