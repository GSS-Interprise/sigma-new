-- Casamento v2: numeroCompra do PNCP diverge da numeração da Effecti, então
-- casa contra numeroCompra E sequencial E ano, e separa 4 níveis:
--   casado   = número bate (numeroCompra ou sequencial) + muni + modalidade
--   provavel = órgão/município tem a modalidade no PNCP (cobertura provável — a
--              lei obriga publicação; número não bate por divergência de numeração)
--   incerto  = município existe no espelho mas sem a modalidade
--   ausente  = município NEM aparece no espelho → candidato a fonte externa
-- Cobertura efetiva = casado + provavel. Gap de fonte externa = ausente.
CREATE OR REPLACE FUNCTION public.pncp_casa_effecti(p_muni text, p_num text, p_mod int, p_ano int DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_num IS NOT NULL AND EXISTS(
      SELECT 1 FROM pncp_mirror m
      WHERE similarity(m.municipio, p_muni) > 0.35
        AND (p_mod IS NULL OR m.modalidade_id = p_mod)
        AND (p_ano IS NULL OR m.ano = p_ano)
        AND (
          regexp_replace(coalesce(m.raw->>'numeroCompra',''),'[^0-9]','','g') ~ ('^0*'||p_num||'$')
          OR m.sequencial::text = p_num
        )
    ) THEN 'casado'
    WHEN p_mod IS NOT NULL AND EXISTS(
      SELECT 1 FROM pncp_mirror m
      WHERE similarity(m.municipio, p_muni) > 0.35 AND m.modalidade_id = p_mod
    ) THEN 'provavel'
    WHEN EXISTS(SELECT 1 FROM pncp_mirror m WHERE similarity(m.municipio, p_muni) > 0.35)
      THEN 'incerto'
    ELSE 'ausente'
  END
$$;
GRANT EXECUTE ON FUNCTION public.pncp_casa_effecti(text,text,int,int) TO authenticated, service_role;
