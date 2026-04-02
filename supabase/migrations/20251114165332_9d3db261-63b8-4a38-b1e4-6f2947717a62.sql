-- Adicionar novo tipo de documento "Link Externo"
ALTER TYPE tipo_documento_medico ADD VALUE IF NOT EXISTS 'link_externo';

-- Adicionar campo para URL externa na tabela medico_documentos
ALTER TABLE medico_documentos ADD COLUMN IF NOT EXISTS url_externa TEXT;

-- Adicionar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_medico_documentos_url_externa ON medico_documentos(url_externa) WHERE url_externa IS NOT NULL;