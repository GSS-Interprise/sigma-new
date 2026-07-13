-- Explorador de pool no wizard de campanha (pedido Raul 13/07): a equipe precisa
-- ENXERGAR a realidade dos médicos antes de criar — não só um número solto.
--
-- Adiciona filtros reais (cidade, origem, tem e-mail, faixa etária) que:
--   1) persistem na campanha (colunas novas),
--   2) o selecionar_leads_campanha aplica de fato (senão o preview mentiria),
--   3) o preview reflete + devolve DISTRIBUIÇÃO por cidade.
-- E uma RPC de facetas pra popular os pickers (cidades/origens) do UF+especialidade.
--
-- Nota: "nunca disparado" foi DESCARTADO de propósito — leads.ultimo_disparo_em só
-- é gravado pelo módulo LEGADO de disparos, nunca pelo campanha-disparo-processor
-- (só 2.236 de 823k preenchidos) → não discrimina nada. Dedup da prospecção é via
-- campanha_leads + alerta cross-campanha (já existentes).

-- 1) Colunas de filtro na campanha (NULL/false = sem filtro = comportamento atual)
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS regiao_cidades   TEXT[];
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS filtro_tem_email BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS filtro_idade_min INT;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS filtro_idade_max INT;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS filtro_origem    TEXT;

-- 2) selecionar_leads_campanha: aplica os filtros novos (aditivo, NULL-safe).
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
  v_tem_email BOOLEAN;
  v_idade_min INT;
  v_idade_max INT;
  v_origem TEXT;
BEGIN
  SELECT c.especialidade_ids, c.especialidade_id, COALESCE(c.sem_especialidade, false),
         c.regiao_estado, c.regiao_cidades, c.leads_excluidos_ids,
         COALESCE(c.filtro_tem_email, false), c.filtro_idade_min, c.filtro_idade_max, c.filtro_origem
  INTO v_especialidade_ids, v_especialidade_id_legacy, v_sem_esp,
       v_estado, v_cidades, v_excluidos,
       v_tem_email, v_idade_min, v_idade_max, v_origem
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
          THEN le.lead_id IS NOT NULL
        ELSE le.especialidade_id = ANY(v_especialidade_ids)
      END
    )
    AND (v_estado IS NULL OR l.uf = v_estado)
    AND (v_cidades IS NULL OR array_length(v_cidades, 1) IS NULL OR l.cidade = ANY(v_cidades))
    -- filtros novos (13/07)
    AND (v_tem_email IS NOT TRUE OR (l.email IS NOT NULL AND l.email <> ''))
    AND (v_origem IS NULL OR l.origem = v_origem)
    AND (v_idade_min IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) >= v_idade_min))
    AND (v_idade_max IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) <= v_idade_max))
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
    AND (v_excluidos IS NULL OR cardinality(v_excluidos) = 0 OR NOT (l.id = ANY(v_excluidos)))
  ORDER BY l.id
  LIMIT p_limite;
END;
$function$;

-- 3) campanha_wizard_preview: aceita cidade + filtros de qualidade, e devolve a
--    DISTRIBUIÇÃO por cidade (top 12). base MATERIALIZED = 1 scan, referenciada 4x.
DROP FUNCTION IF EXISTS public.campanha_wizard_preview(uuid[], text, uuid[], integer, boolean);

CREATE OR REPLACE FUNCTION public.campanha_wizard_preview(
  p_especialidade_ids UUID[] DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_exclude_lead_ids UUID[] DEFAULT NULL,
  p_sample_limit INT DEFAULT 10,
  p_sem_especialidade BOOLEAN DEFAULT false,
  p_cidades TEXT[] DEFAULT NULL,
  p_tem_email BOOLEAN DEFAULT false,
  p_idade_min INT DEFAULT NULL,
  p_idade_max INT DEFAULT NULL,
  p_origem TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    WITH base AS MATERIALIZED (
      SELECT DISTINCT ON (l.id)
        l.id, l.nome, l.phone_e164, l.uf, l.cidade,
        EXISTS (
          SELECT 1 FROM campanha_leads cl
          JOIN campanhas c ON c.id = cl.campanha_id
          WHERE cl.lead_id = l.id AND c.status IN ('ativa', 'pausada')
        ) AS em_outra
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
        AND (p_cidades IS NULL OR cardinality(p_cidades) = 0 OR l.cidade = ANY(p_cidades))
        AND (p_tem_email IS NOT TRUE OR (l.email IS NOT NULL AND l.email <> ''))
        AND (p_origem IS NULL OR l.origem = p_origem)
        AND (p_idade_min IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) >= p_idade_min))
        AND (p_idade_max IS NULL OR (l.data_nascimento IS NOT NULL AND date_part('year', age(l.data_nascimento)) <= p_idade_max))
        AND (p_exclude_lead_ids IS NULL OR cardinality(p_exclude_lead_ids) = 0 OR NOT (l.id = ANY(p_exclude_lead_ids)))
    )
    SELECT jsonb_build_object(
      'count', (SELECT COUNT(*) FROM base),
      'count_em_outras_campanhas', (SELECT COUNT(*) FROM base WHERE em_outra),
      'top_cidades', (
        SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT COALESCE(NULLIF(cidade, ''), '(sem cidade)') AS cidade, COUNT(*) AS n
          FROM base GROUP BY 1 ORDER BY n DESC LIMIT 12
        ) x
      ),
      'sample', (
        SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM (
          SELECT id, nome, phone_e164, uf, cidade FROM base LIMIT p_sample_limit
        ) s
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.campanha_wizard_preview TO authenticated, service_role;

-- 4) campanha_pool_facets: opções pros pickers (cidades + origens) dado esp+uf.
--    NÃO aplica os filtros de qualidade — é justamente o que se escolhe a partir daqui.
CREATE OR REPLACE FUNCTION public.campanha_pool_facets(
  p_especialidade_ids UUID[] DEFAULT NULL,
  p_uf TEXT DEFAULT NULL,
  p_sem_especialidade BOOLEAN DEFAULT false,
  p_busca_cidade TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    WITH base AS MATERIALIZED (
      SELECT DISTINCT ON (l.id) l.id, l.cidade, l.origem
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
    )
    SELECT jsonb_build_object(
      'cidades', (
        SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT cidade, COUNT(*) AS n
          FROM base
          WHERE cidade IS NOT NULL AND cidade <> ''
            AND (p_busca_cidade IS NULL OR p_busca_cidade = '' OR cidade ILIKE '%' || p_busca_cidade || '%')
          GROUP BY cidade ORDER BY n DESC LIMIT 60
        ) x
      ),
      'origens', (
        SELECT COALESCE(jsonb_agg(y), '[]'::jsonb) FROM (
          SELECT origem, COUNT(*) AS n
          FROM base WHERE origem IS NOT NULL AND origem <> ''
          GROUP BY origem ORDER BY n DESC LIMIT 25
        ) y
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.campanha_pool_facets TO authenticated, service_role;
