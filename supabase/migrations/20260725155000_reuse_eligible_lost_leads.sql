CREATE OR REPLACE FUNCTION public.selecionar_perdidos_elegiveis(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    candidate.lead_id,
    candidate.nome,
    candidate.phone_e164,
    candidate.especialidade_nome,
    candidate.uf,
    candidate.cidade
  FROM public.selecionar_leads_estrategia(
    p_campanha_id,
    p_strategy_id,
    least(5000, greatest(coalesce(p_limite, 50) * 20, 500))
  ) WITH ORDINALITY AS candidate(
    lead_id, nome, phone_e164, especialidade_nome, uf, cidade, queue_order
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.campanha_leads previous
    WHERE previous.lead_id = candidate.lead_id
      AND previous.campanha_id <> p_campanha_id
      AND previous.status::text = 'descartado'
  )
  -- Redundância intencional: a função-base já aplica estas barreiras. Mantê-las
  -- explícitas evita regressão se a seleção geral mudar no futuro.
  AND NOT EXISTS (
    SELECT 1
    FROM public.lead_contactability contactability
    WHERE contactability.lead_id = candidate.lead_id
      AND contactability.status <> 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.blacklist blocked
    WHERE blocked.phone_e164 = candidate.phone_e164
  )
  AND EXISTS (
    SELECT 1
    FROM public.leads lead
    WHERE lead.id = candidate.lead_id
      AND coalesce(lead.opt_out, false) = false
  )
  ORDER BY candidate.queue_order
  LIMIT greatest(1, least(coalesce(p_limite, 50), 5000));
$$;

REVOKE ALL ON FUNCTION public.selecionar_perdidos_elegiveis(uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.selecionar_perdidos_elegiveis(uuid, uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.selecionar_perdidos_elegiveis(uuid, uuid, integer) IS
  'Reaproveita perdas locais elegíveis sem reintroduzir opt-out, blacklist, aposentado, sem WhatsApp ou contato inválido.';
