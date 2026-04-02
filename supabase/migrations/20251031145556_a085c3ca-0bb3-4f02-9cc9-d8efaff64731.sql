-- Add missing status value to status_licitacao ENUM
ALTER TYPE status_licitacao ADD VALUE IF NOT EXISTS 'capitacao_de_credenciamento';