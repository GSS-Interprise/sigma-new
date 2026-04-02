-- Remover a constraint antiga que exige 30 caracteres
ALTER TABLE licitacao_descartes DROP CONSTRAINT licitacao_descartes_justificativa_check;

-- Adicionar nova constraint que exige apenas 10 caracteres
ALTER TABLE licitacao_descartes ADD CONSTRAINT licitacao_descartes_justificativa_check CHECK (char_length(justificativa) >= 10);