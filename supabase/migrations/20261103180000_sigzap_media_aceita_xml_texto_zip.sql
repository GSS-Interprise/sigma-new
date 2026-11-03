-- Médico manda XML da nota, planilha CSV, texto e ZIP pelo WhatsApp oficial. Em 03/11, ao recuperar
-- os arquivos da Chakra, o bucket recusou "text/xml". HTML e SVG continuam fora (bucket é público).
update storage.buckets set allowed_mime_types = array[
  'image/*','video/*','audio/*','application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/xml','application/xml','text/plain','text/csv','application/zip','application/x-zip-compressed',
  'application/octet-stream'
] where id = 'sigzap-media';
