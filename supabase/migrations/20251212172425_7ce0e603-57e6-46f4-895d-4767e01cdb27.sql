-- Create storage policies for licitacoes-anexos bucket
CREATE POLICY "Authenticated users can upload to licitacoes-anexos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'licitacoes-anexos');

CREATE POLICY "Authenticated users can view licitacoes-anexos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'licitacoes-anexos');

CREATE POLICY "Public can view licitacoes-anexos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'licitacoes-anexos');

CREATE POLICY "Authenticated users can update licitacoes-anexos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'licitacoes-anexos');

CREATE POLICY "Authenticated users can delete licitacoes-anexos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'licitacoes-anexos');