
-- Remove a constraint UNIQUE de 'numero' (não faz sentido, múltiplas instâncias podem compartilhar número)
ALTER TABLE public.chips DROP CONSTRAINT IF EXISTS chips_numero_key;

-- Adiciona UNIQUE em instance_name para permitir UPSERT correto
ALTER TABLE public.chips ADD CONSTRAINT chips_instance_name_key UNIQUE (instance_name);
