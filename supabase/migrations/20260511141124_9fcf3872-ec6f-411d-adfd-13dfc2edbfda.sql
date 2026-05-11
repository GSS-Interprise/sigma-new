INSERT INTO public.worklist_tarefa_anexos (
  tarefa_id,
  storage_path,
  mime_type,
  nome,
  tamanho_bytes,
  created_by,
  created_at
)
SELECT
  split_part(o.name, '/', 1)::uuid AS tarefa_id,
  o.name AS storage_path,
  COALESCE(o.metadata->>'mimetype', o.metadata->>'mimeType') AS mime_type,
  split_part(o.name, '/', 2) AS nome,
  NULLIF(COALESCE(o.metadata->>'size', o.metadata->>'contentLength'), '')::bigint AS tamanho_bytes,
  o.owner::uuid AS created_by,
  o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'worklist-anexos'
  AND split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.worklist_tarefas t
    WHERE t.id = split_part(o.name, '/', 1)::uuid
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.worklist_tarefa_anexos a
    WHERE a.storage_path = o.name
  );