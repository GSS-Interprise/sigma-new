-- F2.2 — Exclusão manual de leads na criação da campanha
--
-- Antes: operadora via "Ver lista" no wizard mas não tinha como tirar
-- nenhum médico do pool. Tinha que ou aceitar todos ou refazer filtros.
--
-- Agora: operadora marca checkboxes no modal "Ver lista" → os IDs caem
-- em campanhas.leads_excluidos_ids → o RPC selecionar_leads_campanha
-- respeita esse array no NOT IN.

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS leads_excluidos_ids UUID[] DEFAULT '{}'::UUID[];

COMMENT ON COLUMN public.campanhas.leads_excluidos_ids IS
  'F2.2 — IDs de leads que a operadora excluiu manualmente do pool no wizard. RPC selecionar_leads_campanha respeita esse array.';

-- Atualiza o RPC pra respeitar a exclusão manual
CREATE OR REPLACE FUNCTION public.selecionar_leads_campanha(p_campanha_id uuid, p_limite integer DEFAULT 50)
 RETURNS TABLE(lead_id uuid, nome text, phone_e164 text, especialidade_nome text, uf text, cidade text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_especialidade_ids UUID[];
  v_especialidade_id_legacy UUID;
  v_estado TEXT;
  v_cidades TEXT[];
  v_excluidos UUID[];
BEGIN
  SELECT c.especialidade_ids, c.especialidade_id, c.regiao_estado, c.regiao_cidades, c.leads_excluidos_ids
  INTO v_especialidade_ids, v_especialidade_id_legacy, v_estado, v_cidades, v_excluidos
  FROM campanhas c WHERE c.id = p_campanha_id;

  IF (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0) AND v_especialidade_id_legacy IS NOT NULL THEN
    v_especialidade_ids := ARRAY[v_especialidade_id_legacy];
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (l.id)
    l.id AS lead_id, l.nome, l.phone_e164, e.nome AS especialidade_nome, l.uf, l.cidade
  FROM leads l
  JOIN lead_especialidades le ON le.lead_id = l.id
  JOIN especialidades e ON e.id = le.especialidade_id
  WHERE l.merged_into_id IS NULL
    AND (v_especialidade_ids IS NULL OR cardinality(v_especialidade_ids) = 0 OR le.especialidade_id = ANY(v_especialidade_ids))
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
