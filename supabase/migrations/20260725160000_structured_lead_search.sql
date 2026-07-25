CREATE OR REPLACE FUNCTION public.buscar_leads_perfil(
  p_campanha_id uuid,
  p_busca text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_especialidade text DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_regiao_interesse text DEFAULT NULL,
  p_disponibilidade_min integer DEFAULT NULL,
  p_valor_minimo_ate numeric DEFAULT NULL,
  p_limite integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  lead_id uuid,
  nome text,
  crm text,
  phone_e164 text,
  uf text,
  cidade text,
  especialidade text,
  modalidades text[],
  ufs_interesse text[],
  cidades_interesse text[],
  disponibilidade_plantoes_mes integer,
  valor_minimo_aceitavel numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.nome,
    l.crm,
    l.phone_e164,
    l.uf,
    l.cidade,
    l.especialidade,
    bi.modalidade_preferida,
    bi.ufs,
    bi.cidades,
    bi.disponibilidade_plantoes_mes,
    bi.valor_minimo_aceitavel
  FROM public.leads l
  LEFT JOIN public.banco_interesse_leads bi ON bi.lead_id = l.id
  WHERE l.merged_into_id IS NULL
    AND (
      nullif(btrim(p_busca), '') IS NULL
      OR l.nome ILIKE '%' || btrim(p_busca) || '%'
      OR l.crm ILIKE '%' || btrim(p_busca) || '%'
      OR l.phone_e164 ILIKE '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
    )
    AND (nullif(p_uf, '') IS NULL OR upper(l.uf) = upper(p_uf))
    AND (nullif(p_cidade, '') IS NULL OR l.cidade ILIKE '%' || p_cidade || '%')
    AND (
      nullif(p_especialidade, '') IS NULL
      OR l.especialidade ILIKE '%' || p_especialidade || '%'
      OR EXISTS (
        SELECT 1
        FROM public.lead_especialidades le
        JOIN public.especialidades e ON e.id = le.especialidade_id
        WHERE le.lead_id = l.id
          AND e.nome ILIKE '%' || p_especialidade || '%'
      )
    )
    AND (
      nullif(p_modalidade, '') IS NULL
      OR p_modalidade = ANY(coalesce(bi.modalidade_preferida, '{}'::text[]))
      OR p_modalidade = ANY(coalesce(bi.tipo_contratacao_preferida, '{}'::text[]))
    )
    AND (
      nullif(p_regiao_interesse, '') IS NULL
      OR upper(p_regiao_interesse) = ANY(
        SELECT upper(value) FROM unnest(coalesce(bi.ufs, '{}'::text[])) value
      )
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(bi.cidades, '{}'::text[])) value
        WHERE value ILIKE '%' || p_regiao_interesse || '%'
      )
    )
    AND (
      p_disponibilidade_min IS NULL
      OR bi.disponibilidade_plantoes_mes >= p_disponibilidade_min
    )
    AND (
      p_valor_minimo_ate IS NULL
      OR bi.valor_minimo_aceitavel <= p_valor_minimo_ate
    )
    AND coalesce(l.opt_out, false) = false
    AND nullif(l.phone_e164, '') IS NOT NULL
    AND l.classificacao NOT IN ('protegido', 'proibido')
    AND NOT EXISTS (
      SELECT 1 FROM public.blacklist blocked WHERE blocked.phone_e164 = l.phone_e164
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_contactability contactability
      WHERE contactability.lead_id = l.id AND contactability.status <> 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.campanha_leads existing
      WHERE existing.campanha_id = p_campanha_id AND existing.lead_id = l.id
    )
  ORDER BY l.nome, l.id
  LIMIT greatest(1, least(coalesce(p_limite, 100), 500))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.adicionar_leads_estrategia(
  p_campanha_id uuid,
  p_strategy_id uuid,
  p_lead_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_strategies
    WHERE id = p_strategy_id AND campanha_id = p_campanha_id
  ) THEN
    RAISE EXCEPTION 'strategy_not_in_campaign';
  END IF;

  INSERT INTO public.campanha_leads(
    campanha_id, strategy_id, lead_id, status, etapa_acompanhamento
  )
  SELECT
    p_campanha_id, p_strategy_id, lead.id, 'frio', 'frio'
  FROM public.leads lead
  WHERE lead.id = ANY(coalesce(p_lead_ids, '{}'::uuid[]))
    AND lead.merged_into_id IS NULL
    AND coalesce(lead.opt_out, false) = false
    AND nullif(lead.phone_e164, '') IS NOT NULL
    AND lead.classificacao NOT IN ('protegido', 'proibido')
    AND NOT EXISTS (
      SELECT 1 FROM public.blacklist blocked
      WHERE blocked.phone_e164 = lead.phone_e164
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_contactability contactability
      WHERE contactability.lead_id = lead.id AND contactability.status <> 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.campanha_leads existing
      WHERE existing.campanha_id = p_campanha_id
        AND existing.lead_id = lead.id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_leads_perfil(uuid,text,text,text,text,text,text,integer,numeric,integer,integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adicionar_leads_estrategia(uuid,uuid,uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_leads_perfil(uuid,text,text,text,text,text,text,integer,numeric,integer,integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adicionar_leads_estrategia(uuid,uuid,uuid[])
  TO authenticated, service_role;
