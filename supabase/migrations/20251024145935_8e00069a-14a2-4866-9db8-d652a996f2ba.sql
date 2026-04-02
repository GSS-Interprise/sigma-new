-- Criar bucket para anexos de suporte
INSERT INTO storage.buckets (id, name, public) 
VALUES ('suporte-anexos', 'suporte-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para suporte-anexos
CREATE POLICY "Users can upload their own files"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'suporte-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view files from their tickets"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'suporte-anexos'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR is_admin(auth.uid())
  )
);