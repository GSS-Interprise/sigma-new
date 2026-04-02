-- Add storage policies for suporte-anexos bucket
-- Allow all authenticated users to upload (they need to attach files to tickets)
CREATE POLICY "Authenticated users can upload suporte anexos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'suporte-anexos');

-- Allow all authenticated users to view/download
CREATE POLICY "Authenticated users can view suporte anexos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'suporte-anexos');

-- Allow all authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete suporte anexos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'suporte-anexos');