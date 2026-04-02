CREATE OR REPLACE FUNCTION public.get_leads_filter_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'status', (SELECT jsonb_object_agg(status, cnt) FROM (SELECT status, count(*) as cnt FROM leads WHERE status IS NOT NULL AND status != '' GROUP BY status) s),
    'origem', (SELECT jsonb_object_agg(origem, cnt) FROM (SELECT origem, count(*) as cnt FROM leads WHERE origem IS NOT NULL AND origem != '' GROUP BY origem) o),
    'uf', (SELECT jsonb_object_agg(uf, cnt) FROM (SELECT uf, count(*) as cnt FROM leads WHERE uf IS NOT NULL AND uf != '' GROUP BY uf) u),
    'cidade', (SELECT jsonb_object_agg(cidade, cnt) FROM (SELECT cidade, count(*) as cnt FROM leads WHERE cidade IS NOT NULL AND cidade != '' GROUP BY cidade) c),
    'especialidade', (SELECT jsonb_object_agg(especialidade_id::text, cnt) FROM (SELECT especialidade_id, count(*) as cnt FROM leads WHERE especialidade_id IS NOT NULL GROUP BY especialidade_id) e)
  ) INTO result;
  
  RETURN result;
END;
$$;