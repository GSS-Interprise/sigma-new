-- Update the licitacoes-anexos bucket to allow all file types
UPDATE storage.buckets 
SET allowed_mime_types = NULL
WHERE id = 'licitacoes-anexos';

-- If bucket doesn't exist, create it without restrictions
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('licitacoes-anexos', 'licitacoes-anexos', true, NULL)
ON CONFLICT (id) DO UPDATE SET allowed_mime_types = NULL;