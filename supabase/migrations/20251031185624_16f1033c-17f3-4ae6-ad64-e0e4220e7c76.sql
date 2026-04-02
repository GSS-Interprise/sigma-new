-- Garantir que o bucket existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('medicos-documentos', 'medicos-documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem baixar" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar" ON storage.objects;

-- Criar policies para storage
CREATE POLICY "Usuários autenticados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'medicos-documentos');

CREATE POLICY "Usuários autenticados podem baixar"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'medicos-documentos');

CREATE POLICY "Usuários autenticados podem atualizar"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'medicos-documentos');

CREATE POLICY "Usuários autenticados podem deletar"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'medicos-documentos');

-- Garantir que a tabela medico_documentos tenha RLS habilitado
ALTER TABLE medico_documentos ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem
DROP POLICY IF EXISTS "Usuários autenticados podem ver documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar documentos" ON medico_documentos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar documentos" ON medico_documentos;

-- Criar policies para tabela
CREATE POLICY "Usuários autenticados podem ver documentos"
ON medico_documentos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem inserir documentos"
ON medico_documentos FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar documentos"
ON medico_documentos FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem deletar documentos"
ON medico_documentos FOR DELETE
TO authenticated
USING (true);