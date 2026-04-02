-- Create storage bucket for radiologia attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('radiologia-anexos', 'radiologia-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for viewing attachments
CREATE POLICY "Authenticated users can view radiologia attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'radiologia-anexos' AND auth.role() = 'authenticated');

-- Create storage policy for uploading attachments
CREATE POLICY "Authenticated users can upload radiologia attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'radiologia-anexos' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create storage policy for deleting own attachments
CREATE POLICY "Users can delete their own radiologia attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'radiologia-anexos' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);