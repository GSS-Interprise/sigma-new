-- Storage policies for user-notas-anexos bucket
CREATE POLICY "Users can upload their own nota files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own nota files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own nota files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-notas-anexos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
