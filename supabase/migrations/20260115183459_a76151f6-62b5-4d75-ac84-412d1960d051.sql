-- Permitir que cliente_id seja NULL já que agora usamos ages_cliente_id
ALTER TABLE public.ages_producao ALTER COLUMN cliente_id DROP NOT NULL;