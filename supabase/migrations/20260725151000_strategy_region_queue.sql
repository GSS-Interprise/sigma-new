-- Seleção explícita por estratégia. A ordem de regiões controla a fila real.
CREATE OR REPLACE FUNCTION public.selecionar_leads_estrategia(
  p_campanha_id uuid,
  p_strategy_id uuid,
  p_limite integer DEFAULT 50
)
RETURNS TABLE(
  lead_id uuid,
  nome text,
  phone_e164 text,
  especialidade_nome text,
  uf text,
  cidade text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_especialidade_ids uuid[];
  v_especialidade_id_legacy uuid;
  v_sem_esp boolean;
  v_estado text;
  v_cidades text[];
  v_excluidos uuid[];
  v_tem_email boolean;
  v_idade_min integer;
  v_idade_max integer;
  v_origem text;
  v_ordem_regioes jsonb;
  v_strategy_ufs text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_strategies s
    WHERE s.id = p_strategy_id
      AND s.campanha_id = p_campanha_id
      AND s.status IN ('ativa', 'rascunho')
  ) THEN
    RAISE EXCEPTION 'strategy_not_available_for_campaign';
  END IF;

  SELECT
    c.especialidade_ids,
    c.especialidade_id,
    coalesce(c.sem_especialidade, false),
    c.regiao_estado,
    c.regiao_cidades,
    c.leads_excluidos_ids,
    coalesce(c.filtro_tem_email, false),
    c.filtro_idade_min,
    c.filtro_idade_max,
    c.filtro_origem,
    s.ordem_regioes
  INTO
    v_especialidade_ids,
    v_especialidade_id_legacy,
    v_sem_esp,
    v_estado,
    v_cidades,
    v_excluidos,
    v_tem_email,
    v_idade_min,
    v_idade_max,
    v_origem,
    v_ordem_regioes
  FROM public.campanhas c
  JOIN public.campaign_strategies s
    ON s.campanha_id = c.id AND s.id = p_strategy_id
  WHERE c.id = p_campanha_id;

  SELECT coalesce(array_agg(upper(value->>'uf') ORDER BY (value->>'ordem')::integer), '{}'::text[])
  INTO v_strategy_ufs
  FROM jsonb_array_elements(coalesce(v_ordem_regioes, '[]'::jsonb));

  IF (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0)
     AND v_especialidade_id_legacy IS NOT NULL THEN
    v_especialidade_ids := ARRAY[v_especialidade_id_legacy];
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT DISTINCT ON (l.id)
      l.id AS selected_lead_id,
      l.nome AS selected_name,
      l.phone_e164 AS selected_phone,
      coalesce(e.nome, 'Generalista') AS selected_specialty,
      l.uf AS selected_uf,
      l.cidade AS selected_city,
      coalesce((
        SELECT (region->>'ordem')::integer
        FROM jsonb_array_elements(coalesce(v_ordem_regioes, '[]'::jsonb)) region
        WHERE upper(region->>'uf') = upper(coalesce(l.uf, ''))
        LIMIT 1
      ), 9999) AS region_priority
    FROM public.leads l
    LEFT JOIN public.lead_especialidades le ON le.lead_id = l.id
    LEFT JOIN public.especialidades e ON e.id = le.especialidade_id
    WHERE l.merged_into_id IS NULL
      AND (
        CASE
          WHEN v_sem_esp AND (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0)
            THEN le.lead_id IS NULL
          WHEN v_sem_esp
            THEN le.lead_id IS NULL OR le.especialidade_id = ANY(v_especialidade_ids)
          WHEN v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0
            THEN le.lead_id IS NOT NULL
          ELSE le.especialidade_id = ANY(v_especialidade_ids)
        END
      )
      AND (
        CASE
          WHEN cardinality(v_strategy_ufs) > 0 THEN upper(l.uf) = ANY(v_strategy_ufs)
          ELSE v_estado IS NULL OR l.uf = v_estado
        END
      )
      AND (v_cidades IS NULL OR cardinality(v_cidades) = 0 OR l.cidade = ANY(v_cidades))
      AND (v_tem_email IS NOT TRUE OR nullif(l.email, '') IS NOT NULL)
      AND (v_origem IS NULL OR l.origem = v_origem)
      AND (v_idade_min IS NULL OR (
        l.data_nascimento IS NOT NULL
        AND date_part('year', age(l.data_nascimento)) >= v_idade_min
      ))
      AND (v_idade_max IS NULL OR (
        l.data_nascimento IS NOT NULL
        AND date_part('year', age(l.data_nascimento)) <= v_idade_max
      ))
      AND nullif(l.phone_e164, '') IS NOT NULL
      AND l.opt_out = false
      AND l.classificacao NOT IN ('protegido', 'proibido')
      AND (l.cooldown_ate IS NULL OR l.cooldown_ate <= now())
      AND l.data_conversao IS NULL
      AND l.convertido_por IS NULL
      AND (l.unidades_vinculadas IS NULL OR cardinality(l.unidades_vinculadas) = 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.blacklist bl WHERE bl.phone_e164 = l.phone_e164
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.lead_contactability lc
        WHERE lc.lead_id = l.id AND lc.status <> 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.campanha_leads cl
        WHERE cl.lead_id = l.id AND cl.campanha_id = p_campanha_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.leads_bloqueio_temporario lb
        WHERE lb.lead_id = l.id AND lb.removed_at IS NULL
      )
      AND (
        v_excluidos IS NULL
        OR cardinality(v_excluidos) = 0
        OR NOT l.id = ANY(v_excluidos)
      )
    ORDER BY l.id, e.nome NULLS LAST
  )
  SELECT
    eligible.selected_lead_id,
    eligible.selected_name,
    eligible.selected_phone,
    eligible.selected_specialty,
    eligible.selected_uf,
    eligible.selected_city
  FROM eligible
  ORDER BY eligible.region_priority, eligible.selected_lead_id
  LIMIT greatest(1, least(coalesce(p_limite, 50), 5000));
END;
$$;

REVOKE ALL ON FUNCTION public.selecionar_leads_estrategia(uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.selecionar_leads_estrategia(uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.selecionar_leads_estrategia(uuid, uuid, integer) IS
  'Seleciona leads elegíveis para uma estratégia e respeita a prioridade real de UFs em ordem_regioes.';
