-- Remover trigger antigo
DROP TRIGGER IF EXISTS set_contrato_codigo_interno ON contratos;

-- Criar nova função que usa MAX+1
CREATE OR REPLACE FUNCTION public.generate_contrato_codigo_interno()
RETURNS TRIGGER AS $$
DECLARE
  next_id INTEGER;
BEGIN
  IF NEW.codigo_interno IS NULL THEN
    SELECT COALESCE(MAX(codigo_interno), 0) + 1 INTO next_id FROM contratos;
    NEW.codigo_interno := next_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Recriar trigger com nova função
CREATE TRIGGER set_contrato_codigo_interno
  BEFORE INSERT ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_contrato_codigo_interno();