
-- Remover o constraint antigo de status_contrato
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_contrato_check;

-- Criar novo constraint incluindo 'Pre-Contrato' como valor válido
ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_contrato_check 
  CHECK (status_contrato IN ('Ativo', 'Inativo', 'Encerrado', 'Suspenso', 'Em Renovação', 'Pre-Contrato'));
