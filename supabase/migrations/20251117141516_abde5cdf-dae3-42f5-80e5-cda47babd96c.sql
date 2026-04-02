-- Atualizar bucket contratos-documentos para aceitar mais tipos de arquivo
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed'
]
WHERE id = 'contratos-documentos';