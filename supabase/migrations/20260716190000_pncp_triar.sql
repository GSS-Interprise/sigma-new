-- =====================================================================
-- pncp_triar — popula a fila de triagem aplicando o SCORE (custo zero).
-- Faixas: score>=5 auto_aprovado | 3-4 pendente_humano | <3 auto_rejeitado.
-- Só toca candidatos ainda sem triagem (idempotente). Chamada por cron.
-- =====================================================================
ALTER TABLE public.pncp_triagem ADD COLUMN IF NOT EXISTS score int;

CREATE OR REPLACE FUNCTION public.pncp_triar(p_slug text)
RETURNS TABLE(auto_aprovado int, pendente int, auto_rejeitado int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pncp_triagem (numero_controle_pncp, perfil_slug, score, status, ia_motivo, ia_classificado_em)
  SELECT m.numero_controle_pncp, p_slug, pncp_score_gss(m.busca_objeto),
    CASE WHEN pncp_score_gss(m.busca_objeto) >= 5 THEN 'auto_aprovado'
         WHEN pncp_score_gss(m.busca_objeto) >= 3 THEN 'pendente_humano'
         ELSE 'auto_rejeitado' END,
    'score='||pncp_score_gss(m.busca_objeto), now()
  FROM public.pncp_relevantes(p_slug) m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pncp_triagem t
    WHERE t.numero_controle_pncp = m.numero_controle_pncp AND t.perfil_slug = p_slug)
  ON CONFLICT (numero_controle_pncp, perfil_slug) DO NOTHING;

  RETURN QUERY
    SELECT
      count(*) FILTER (WHERE status='auto_aprovado')::int,
      count(*) FILTER (WHERE status='pendente_humano')::int,
      count(*) FILTER (WHERE status='auto_rejeitado')::int
    FROM public.pncp_triagem WHERE perfil_slug = p_slug;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pncp_triar(text) TO authenticated, service_role;
