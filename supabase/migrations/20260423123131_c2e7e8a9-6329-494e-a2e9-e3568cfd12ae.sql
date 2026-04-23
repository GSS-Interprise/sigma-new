-- RPC para buscar leads paginados filtrando por especialidades via tabela N:N lead_especialidades
-- Resolve o problema de URL gigante ao tentar passar dezenas de milhares de IDs em .in() do PostgREST
CREATE OR REPLACE FUNCTION public.search_leads_for_picker(
  p_especialidade_ids uuid[] DEFAULT NULL,
  p_ufs text[] DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_ano_min int DEFAULT NULL,
  p_ano_max int DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_only_ids boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  nome text,
  phone_e164 text,
  especialidade text,
  especialidade_id uuid,
  uf text,
  cidade text,
  data_formatura date,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_busca text := NULLIF(trim(coalesce(p_busca, '')), '');
  v_cidade text := NULLIF(trim(coalesce(p_cidade, '')), '');
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT l.id, l.nome, l.phone_e164, l.especialidade, l.especialidade_id,
           l.uf, l.cidade, l.data_formatura
    FROM public.leads l
    WHERE l.phone_e164 IS NOT NULL
      AND l.merged_into_id IS NULL
      AND (
        p_especialidade_ids IS NULL
        OR array_length(p_especialidade_ids, 1) IS NULL
        OR EXISTS (
          SELECT 1 FROM public.lead_especialidades le
          WHERE le.lead_id = l.id
            AND le.especialidade_id = ANY(p_especialidade_ids)
        )
      )
      AND (
        p_ufs IS NULL
        OR array_length(p_ufs, 1) IS NULL
        OR upper(coalesce(l.uf, '')) = ANY(SELECT upper(u) FROM unnest(p_ufs) u)
      )
      AND (v_cidade IS NULL OR l.cidade ILIKE '%' || v_cidade || '%')
      AND (p_ano_min IS NULL OR l.data_formatura >= make_date(p_ano_min, 1, 1))
      AND (p_ano_max IS NULL OR l.data_formatura <= make_date(p_ano_max, 12, 31))
      AND (
        v_busca IS NULL
        OR l.nome ILIKE '%' || v_busca || '%'
        OR l.phone_e164 ILIKE '%' || v_busca || '%'
        OR l.especialidade ILIKE '%' || v_busca || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS c FROM base
  )
  SELECT b.id, b.nome, b.phone_e164, b.especialidade, b.especialidade_id,
         b.uf, b.cidade, b.data_formatura,
         (SELECT c FROM counted) AS total_count
  FROM base b
  ORDER BY
    CASE WHEN p_only_ids THEN NULL ELSE b.nome END ASC NULLS LAST,
    b.id
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_leads_for_picker(uuid[], text[], text, int, int, text, int, int, boolean) TO authenticated, service_role;