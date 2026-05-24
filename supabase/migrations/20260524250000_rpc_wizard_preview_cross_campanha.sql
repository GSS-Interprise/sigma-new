-- Bloco G: RPC preview agora retorna info cross-campanha
--   - count_em_outras_campanhas: quantos do pool ja estao em ativa/pausada
--   - sample[i].outras_campanhas: lista de nomes de campanhas onde o lead esta
--
-- UI usa pra alertar operadora antes de criar nova campanha com lead duplicado
-- (nao bloqueia — apenas indica visualmente).

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
  v_count_cross BIGINT;
  v_sample JSONB;
BEGIN
  WITH base AS (
    SELECT DISTINCT l.id
    FROM leads l
    LEFT JOIN lead_especialidades le ON le.lead_id = l.id
    WHERE l.merged_into_id IS NULL
      AND l.phone_e164 IS NOT NULL AND l.phone_e164 != ''
      AND l.opt_out = false
      AND (l.classificacao IS NULL OR l.classificacao NOT IN ('protegido', 'proibido'))
      AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= NOW())
      AND NOT EXISTS (SELECT 1 FROM blacklist bl WHERE bl.phone_e164 = l.phone_e164)
      AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0 OR le.especialidade_id = ANY(p_especialidade_ids))
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
  )
  SELECT COUNT(*) INTO v_count FROM base;

  SELECT COUNT(DISTINCT b.id) INTO v_count_cross
  FROM (
    SELECT DISTINCT l.id
    FROM leads l
    LEFT JOIN lead_especialidades le ON le.lead_id = l.id
    WHERE l.merged_into_id IS NULL
      AND l.phone_e164 IS NOT NULL AND l.phone_e164 != ''
      AND l.opt_out = false
      AND (l.classificacao IS NULL OR l.classificacao NOT IN ('protegido', 'proibido'))
      AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= NOW())
      AND NOT EXISTS (SELECT 1 FROM blacklist bl WHERE bl.phone_e164 = l.phone_e164)
      AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0 OR le.especialidade_id = ANY(p_especialidade_ids))
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
  ) b
  WHERE EXISTS (
    SELECT 1 FROM campanha_leads cl
    JOIN campanhas c ON c.id = cl.campanha_id
    WHERE cl.lead_id = b.id AND c.status IN ('ativa', 'pausada')
  );

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_sample
  FROM (
    SELECT DISTINCT ON (l.id)
      l.id, l.nome, l.phone_e164, l.uf, l.cidade,
      (SELECT jsonb_agg(c.nome ORDER BY c.created_at DESC)
        FROM campanha_leads cl
        JOIN campanhas c ON c.id = cl.campanha_id
        WHERE cl.lead_id = l.id AND c.status IN ('ativa','pausada')
      ) AS outras_campanhas
    FROM leads l
    LEFT JOIN lead_especialidades le ON le.lead_id = l.id
    WHERE l.merged_into_id IS NULL
      AND l.phone_e164 IS NOT NULL AND l.phone_e164 != ''
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

  RETURN jsonb_build_object('count', v_count, 'count_em_outras_campanhas', v_count_cross, 'sample', v_sample);
END;
$$;
