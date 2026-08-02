CREATE OR REPLACE FUNCTION public.adicionar_leads_estrategia(
  p_campanha_id uuid,
  p_strategy_id uuid,
  p_lead_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_strategies
    WHERE id = p_strategy_id
      AND campanha_id = p_campanha_id
  ) THEN
    RAISE EXCEPTION 'strategy_not_in_campaign';
  END IF;

  INSERT INTO public.campanha_leads(
    campanha_id,
    strategy_id,
    lead_id,
    status,
    etapa_acompanhamento
  )
  SELECT
    p_campanha_id,
    p_strategy_id,
    lead.id,
    'frio',
    NULL
  FROM public.leads lead
  WHERE lead.id = ANY(coalesce(p_lead_ids, '{}'::uuid[]))
    AND lead.merged_into_id IS NULL
    AND coalesce(lead.opt_out, false) = false
    AND nullif(lead.phone_e164, '') IS NOT NULL
    AND lead.classificacao NOT IN ('protegido', 'proibido')
    AND NOT EXISTS (
      SELECT 1
      FROM public.blacklist blocked
      WHERE blocked.phone_e164 = lead.phone_e164
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.lead_contactability contactability
      WHERE contactability.lead_id = lead.id
        AND contactability.status <> 'active'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.campanha_leads existing
      WHERE existing.campanha_id = p_campanha_id
        AND existing.lead_id = lead.id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$function$;
