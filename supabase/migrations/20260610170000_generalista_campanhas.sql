-- Generalista (sem especialidade) como alvo de campanha — pedido equipe 10/06.
-- Contexto: 102k+ leads válidos sem nenhuma especialidade (pós-backfill CFM).
-- O filtro só enxergava a junction lead_especialidades; generalista era
-- inalcançável (selecionar_leads_campanha usava INNER JOIN).
--
-- 1. campanhas.sem_especialidade: flag setada pelo wizard (pseudo-opção
--    "Generalista" no picker). Combinável com especialidade_ids (semântica OR).
-- 2. selecionar_leads_campanha: LEFT JOIN + CASE. Comportamento legado
--    preservado: sem flag e sem filtro continua exigindo ter especialidade
--    (não inflar campanhas existentes com 100k generalistas de surpresa).
-- 3. campanha_wizard_preview: ganha p_sem_especialidade (drop + recreate
--    pra não deixar overload ambíguo no PostgREST).

ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS sem_especialidade BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.selecionar_leads_campanha(p_campanha_id uuid, p_limite integer DEFAULT 50)
 RETURNS TABLE(lead_id uuid, nome text, phone_e164 text, especialidade_nome text, uf text, cidade text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_especialidade_ids UUID[];
  v_especialidade_id_legacy UUID;
  v_sem_esp BOOLEAN;
  v_estado TEXT;
  v_cidades TEXT[];
  v_excluidos UUID[];
BEGIN
  SELECT c.especialidade_ids, c.especialidade_id, COALESCE(c.sem_especialidade, false), c.regiao_estado, c.regiao_cidades, c.leads_excluidos_ids
  INTO v_especialidade_ids, v_especialidade_id_legacy, v_sem_esp, v_estado, v_cidades, v_excluidos
  FROM campanhas c WHERE c.id = p_campanha_id;

  IF (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0) AND v_especialidade_id_legacy IS NOT NULL THEN
    v_especialidade_ids := ARRAY[v_especialidade_id_legacy];
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (l.id)
    l.id AS lead_id, l.nome, l.phone_e164,
    COALESCE(e.nome, 'Generalista') AS especialidade_nome, l.uf, l.cidade
  FROM leads l
  LEFT JOIN lead_especialidades le ON le.lead_id = l.id
  LEFT JOIN especialidades e ON e.id = le.especialidade_id
  WHERE l.merged_into_id IS NULL
    AND (
      CASE
        WHEN v_sem_esp AND (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0)
          THEN le.lead_id IS NULL
        WHEN v_sem_esp
          THEN (le.lead_id IS NULL OR le.especialidade_id = ANY(v_especialidade_ids))
        WHEN v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0
          -- legado: sem filtro nenhum, segue exigindo ter especialidade (era INNER JOIN)
          THEN le.lead_id IS NOT NULL
        ELSE le.especialidade_id = ANY(v_especialidade_ids)
      END
    )
    AND (v_estado IS NULL OR l.uf = v_estado)
    AND (v_cidades IS NULL OR array_length(v_cidades, 1) IS NULL OR l.cidade = ANY(v_cidades))
    AND l.phone_e164 IS NOT NULL
    AND l.phone_e164 != ''
    AND l.opt_out = false
    AND l.classificacao NOT IN ('protegido', 'proibido')
    AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= NOW())
    AND l.data_conversao IS NULL
    AND l.convertido_por IS NULL
    AND (l.unidades_vinculadas IS NULL OR array_length(l.unidades_vinculadas, 1) IS NULL)
    AND NOT EXISTS (SELECT 1 FROM blacklist bl WHERE bl.phone_e164 = l.phone_e164)
    AND NOT EXISTS (SELECT 1 FROM campanha_leads cl WHERE cl.lead_id = l.id AND cl.campanha_id = p_campanha_id)
    AND NOT EXISTS (SELECT 1 FROM leads_bloqueio_temporario lb WHERE lb.lead_id = l.id AND lb.removed_at IS NULL)
    -- F2.2: respeita exclusão manual da operadora no wizard
    AND (v_excluidos IS NULL OR cardinality(v_excluidos) = 0 OR NOT (l.id = ANY(v_excluidos)))
  ORDER BY l.id
  LIMIT p_limite;
END;
$function$;

DROP FUNCTION IF EXISTS public.campanha_wizard_preview(uuid[], text, uuid[], integer);

CREATE OR REPLACE FUNCTION public.campanha_wizard_preview(
  p_especialidade_ids UUID[] DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_exclude_lead_ids UUID[] DEFAULT NULL,
  p_sample_limit INT DEFAULT 10,
  p_sem_especialidade BOOLEAN DEFAULT false
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
      AND (
        CASE
          WHEN p_sem_especialidade AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0)
            THEN le.lead_id IS NULL
          WHEN p_sem_especialidade
            THEN (le.lead_id IS NULL OR le.especialidade_id = ANY(p_especialidade_ids))
          WHEN p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0
            THEN TRUE
          ELSE le.especialidade_id = ANY(p_especialidade_ids)
        END
      )
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
      AND (
        CASE
          WHEN p_sem_especialidade AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0)
            THEN le.lead_id IS NULL
          WHEN p_sem_especialidade
            THEN (le.lead_id IS NULL OR le.especialidade_id = ANY(p_especialidade_ids))
          WHEN p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0
            THEN TRUE
          ELSE le.especialidade_id = ANY(p_especialidade_ids)
        END
      )
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
      AND (
        CASE
          WHEN p_sem_especialidade AND (p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0)
            THEN le.lead_id IS NULL
          WHEN p_sem_especialidade
            THEN (le.lead_id IS NULL OR le.especialidade_id = ANY(p_especialidade_ids))
          WHEN p_especialidade_ids IS NULL OR cardinality(p_especialidade_ids) = 0
            THEN TRUE
          ELSE le.especialidade_id = ANY(p_especialidade_ids)
        END
      )
      AND (p_uf IS NULL OR l.uf = p_uf)
      AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
    ORDER BY l.id
    LIMIT p_sample_limit
  ) t;

  RETURN jsonb_build_object('count', v_count, 'count_em_outras_campanhas', v_count_cross, 'sample', v_sample);
END;
$$;
