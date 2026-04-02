-- Remove MIME type restrictions from editais-pdfs bucket to allow all file types including ZIP
UPDATE storage.buckets 
SET allowed_mime_types = NULL 
WHERE id = 'editais-pdfs';