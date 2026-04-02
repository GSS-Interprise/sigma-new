-- Remover trigger de auditoria automática da tabela contratos
-- O registro de auditoria é feito pelo frontend com informações mais detalhadas
DROP TRIGGER IF EXISTS audit_contratos ON public.contratos;