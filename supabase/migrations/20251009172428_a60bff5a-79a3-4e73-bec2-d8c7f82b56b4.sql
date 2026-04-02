-- Adicionar campos necessários na tabela contratos
ALTER TABLE contratos 
ADD COLUMN IF NOT EXISTS status_contrato text CHECK (status_contrato IN ('Ativo','Inativo','Suspenso','Cancelado')) DEFAULT 'Ativo',
ADD COLUMN IF NOT EXISTS especialidade_contrato text CHECK (especialidade_contrato IN ('Hospital','Clínica','Pessoa Física','Pessoa Jurídica'));

-- Renomear campos na tabela clientes para padronizar
ALTER TABLE clientes 
RENAME COLUMN email TO email_contato;

ALTER TABLE clientes 
RENAME COLUMN telefone TO telefone_contato;

-- Criar índice composto para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_contratos_cliente_status_esp 
ON contratos (cliente_id, status_contrato, especialidade_contrato);

-- Criar índice único no CNPJ se ainda não existir
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_cnpj 
ON clientes (cnpj);