-- Permitir user_id NULL na tabela licitacoes_atividades para atividades do sistema/API
ALTER TABLE licitacoes_atividades ALTER COLUMN user_id DROP NOT NULL;

-- Adicionar política para service_role inserir atividades
DROP POLICY IF EXISTS "Service role pode inserir atividades" ON licitacoes_atividades;
CREATE POLICY "Service role pode inserir atividades" 
ON licitacoes_atividades 
FOR INSERT 
WITH CHECK (true);