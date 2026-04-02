CREATE OR REPLACE FUNCTION public.get_leads_especialidade_counts()
RETURNS TABLE(especialidade_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT especialidade_id, count(*) as count
  FROM public.leads
  WHERE especialidade_id IS NOT NULL
  GROUP BY especialidade_id;
$$;