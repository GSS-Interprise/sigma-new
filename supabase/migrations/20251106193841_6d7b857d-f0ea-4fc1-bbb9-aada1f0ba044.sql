-- Adicionar constraint UNIQUE para evitar conversas duplicadas
ALTER TABLE public.conversas
ADD CONSTRAINT conversas_id_conversa_unique UNIQUE (id_conversa);