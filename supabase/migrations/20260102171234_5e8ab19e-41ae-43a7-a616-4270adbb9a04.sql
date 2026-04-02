-- Tornar o bucket ages-documentos público para permitir uploads
UPDATE storage.buckets 
SET public = true 
WHERE id = 'ages-documentos';

-- Criar política de upload se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir upload ages-documentos'
  ) THEN
    CREATE POLICY "Permitir upload ages-documentos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Criar política de leitura pública se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir leitura ages-documentos'
  ) THEN
    CREATE POLICY "Permitir leitura ages-documentos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'ages-documentos');
  END IF;
END $$;

-- Criar política de delete se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir delete ages-documentos'
  ) THEN
    CREATE POLICY "Permitir delete ages-documentos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;