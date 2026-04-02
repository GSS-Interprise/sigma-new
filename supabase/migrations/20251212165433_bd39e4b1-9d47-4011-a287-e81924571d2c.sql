-- Criar sequência para codigo_interno começando do valor máximo atual + 1
CREATE SEQUENCE IF NOT EXISTS contratos_codigo_interno_seq;

-- Ajustar a sequência para começar do próximo valor disponível
SELECT setval('contratos_codigo_interno_seq', COALESCE((SELECT MAX(codigo_interno) FROM contratos), 0) + 1, false);

-- Definir o default do campo codigo_interno para usar a sequência
ALTER TABLE contratos ALTER COLUMN codigo_interno SET DEFAULT nextval('contratos_codigo_interno_seq');

-- Criar função para gerar codigo_interno automaticamente se não fornecido
CREATE OR REPLACE FUNCTION public.generate_contrato_codigo_interno()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_interno IS NULL THEN
    NEW.codigo_interno := nextval('contratos_codigo_interno_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger para executar a função antes de inserir
DROP TRIGGER IF EXISTS set_contrato_codigo_interno ON contratos;
CREATE TRIGGER set_contrato_codigo_interno
  BEFORE INSERT ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_contrato_codigo_interno();