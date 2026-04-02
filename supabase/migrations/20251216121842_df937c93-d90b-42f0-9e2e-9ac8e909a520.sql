
-- Remover o constraint antigo e criar um novo que permita Pre-Contratos sem cliente/medico
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS check_cliente_ou_medico;

-- Criar novo constraint que permite Pre-Contratos sem cliente_id ou medico_id
ALTER TABLE public.contratos ADD CONSTRAINT check_cliente_ou_medico 
  CHECK (
    status_contrato = 'Pre-Contrato' 
    OR cliente_id IS NOT NULL 
    OR medico_id IS NOT NULL
  );
