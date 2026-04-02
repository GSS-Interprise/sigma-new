-- Alterar coluna alocado_cliente_id para aceitar múltiplos clientes
-- Primeiro vamos criar uma coluna temporária com array
ALTER TABLE public.medicos 
ADD COLUMN alocado_clientes_ids uuid[] DEFAULT NULL;

-- Copiar dados existentes da coluna alocado_cliente_id para alocado_clientes_ids como array
UPDATE public.medicos 
SET alocado_clientes_ids = ARRAY[alocado_cliente_id] 
WHERE alocado_cliente_id IS NOT NULL;

-- Remover a coluna antiga alocado_cliente_id
ALTER TABLE public.medicos 
DROP COLUMN alocado_cliente_id;

-- Renomear a nova coluna para alocado_cliente_id
ALTER TABLE public.medicos 
RENAME COLUMN alocado_clientes_ids TO alocado_cliente_id;

COMMENT ON COLUMN public.medicos.alocado_cliente_id IS 'IDs dos clientes onde o médico está alocado. Campo opcional, permite múltiplos clientes.';