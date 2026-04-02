-- Adicionar coluna email na tabela leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS email TEXT;