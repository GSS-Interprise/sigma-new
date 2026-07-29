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
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
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

CREATE OR REPLACE FUNCTION public.adicionar_lista_estrategia(
  p_campanha_id uuid,
  p_strategy_id uuid,
  p_lista_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_ids uuid[];
  v_total integer := 0;
  v_inserted integer := 0;
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
  IF NOT EXISTS (SELECT 1 FROM public.disparo_listas WHERE id = p_lista_id) THEN
    RAISE EXCEPTION 'list_not_found';
  END IF;

  SELECT coalesce(array_agg(item.lead_id), '{}'::uuid[]), count(*)::integer
    INTO v_lead_ids, v_total
  FROM public.disparo_lista_itens item
  WHERE item.lista_id = p_lista_id;

  INSERT INTO public.campanha_listas(campanha_id, lista_id, created_by)
  VALUES (p_campanha_id, p_lista_id, auth.uid())
  ON CONFLICT (campanha_id, lista_id) DO NOTHING;

  v_inserted := public.adicionar_leads_estrategia(
    p_campanha_id,
    p_strategy_id,
    v_lead_ids
  );

  RETURN jsonb_build_object(
    'total_lista', v_total,
    'adicionados', v_inserted,
    'nao_adicionados', greatest(v_total - v_inserted, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adicionar_lista_estrategia(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_lista_estrategia(uuid, uuid, uuid)
  TO authenticated;
