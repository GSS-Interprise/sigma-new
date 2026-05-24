-- F2.2 — RPC server-side pro preview de funil do wizard de campanha.
--
-- Antes: query client-side em lead_especialidades + leads (duplicava lógica
-- do selecionar_leads_campanha, sem LIMIT adequado, podia trazer muitas linhas).
-- Agora: 1 call server-side retorna {count, sample[10]}. Mais leve e centraliza
-- a lógica de filtros aceitáveis.

CREATE OR REPLACE FUNCTION public.campanha_wizard_preview(
  p_especialidade_ids UUID[] DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_exclude_lead_ids UUID[] DEFAULT NULL,
  p_sample_limit INT DEFAULT 10
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
  v_sample JSONB;
BEGIN
  WITH base AS (
    SELECT DISTINCT l.id
    FROM leads l
    LEFT JOIN lead_especialidades le ON le.lead_id = l.id
    WHERE l.merged_into_id IS NULL
      AND l.phone_e164 IS NOT NULL
      AND l.phone_e164 != ''
      AND l.opt_out = false
      AND (l.classificacao IS NULL OR l.classificacao NOT IN ('protegido', 'proibido'))
      AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= NOW())
      AND NOT EXISTS (SELECT 1 FROM blacklist bl WHERE bl.phone_e164 = l.phone_e164)
      AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0 OR le.especialidade_id = ANY(p_especialidade_ids))
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
  )
  SELECT COUNT(*) INTO v_count FROM base;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sample
  FROM (
    SELECT DISTINCT ON (l.id) l.id, l.nome, l.phone_e164, l.uf, l.cidade
    FROM leads l
    LEFT JOIN lead_especialidades le ON le.lead_id = l.id
    WHERE l.merged_into_id IS NULL
      AND l.phone_e164 IS NOT NULL
      AND l.phone_e164 != ''
      AND l.opt_out = false
      AND (l.classificacao IS NULL OR l.classificacao NOT IN ('protegido', 'proibido'))
      AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= NOW())
      AND NOT EXISTS (SELECT 1 FROM blacklist bl WHERE bl.phone_e164 = l.phone_e164)
      AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0 OR le.especialidade_id = ANY(p_especialidade_ids))
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
    ORDER BY l.id
    LIMIT p_sample_limit
  ) t;

  RETURN jsonb_build_object('count', v_count, 'sample', v_sample);
END;
$$;

GRANT EXECUTE ON FUNCTION public.campanha_wizard_preview TO authenticated, service_role;
