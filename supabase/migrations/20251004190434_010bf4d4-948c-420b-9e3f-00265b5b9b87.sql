-- Adicionar campo codigo_contrato na tabela contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS codigo_contrato TEXT;