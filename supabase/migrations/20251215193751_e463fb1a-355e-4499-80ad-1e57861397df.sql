-- Tornar bucket comunicacao-anexos público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'comunicacao-anexos';

-- Criar política de visualização pública (drop se existir primeiro)
DROP POLICY IF EXISTS "Public can view comunicacao anexos" ON storage.objects;
CREATE POLICY "Public can view comunicacao anexos"
ON storage.objects FOR SELECT
USING (bucket_id = 'comunicacao-anexos');

-- Criar política para usuários autenticados fazerem upload
DROP POLICY IF EXISTS "Authenticated users can upload comunicacao anexos" ON storage.objects;
CREATE POLICY "Authenticated users can upload comunicacao anexos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comunicacao-anexos');

-- Criar política para usuários autenticados deletarem seus próprios arquivos
DROP POLICY IF EXISTS "Users can delete own comunicacao anexos" ON storage.objects;
CREATE POLICY "Users can delete own comunicacao anexos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'comunicacao-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);