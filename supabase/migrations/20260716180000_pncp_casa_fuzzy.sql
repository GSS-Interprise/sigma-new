-- Casamento FUZZY Effecti×espelho: os dados da Effecti têm encoding corrompido
-- (município "Luc�lia"), então casamento exato falha. pg_trgm tolera a corrupção
-- (similarity 'Lucélia' vs 'Luc�lia' = 0.5).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_muni_trgm ON public.pncp_mirror USING gin (municipio gin_trgm_ops);

-- Retorna 'casado' (muni~ + número + modalidade), 'incerto' (só muni~), 'ausente'.
CREATE OR REPLACE FUNCTION public.pncp_casa_effecti(p_muni text, p_num text, p_mod int)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_num IS NOT NULL AND EXISTS(
      SELECT 1 FROM pncp_mirror m
      WHERE similarity(m.municipio, p_muni) > 0.35
        AND (p_mod IS NULL OR m.modalidade_id = p_mod)
        AND regexp_replace(coalesce(m.raw->>'numeroCompra',''),'[^0-9]','','g') ~ ('0*'||p_num||'$')
    ) THEN 'casado'
    WHEN EXISTS(SELECT 1 FROM pncp_mirror m WHERE similarity(m.municipio, p_muni) > 0.35)
    THEN 'incerto'
    ELSE 'ausente'
  END
$$;
GRANT EXECUTE ON FUNCTION public.pncp_casa_effecti(text,text,int) TO authenticated, service_role;
