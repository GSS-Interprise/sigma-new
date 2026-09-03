-- Encerra automaticamente a cadência quando o médico recusa a oportunidade
-- e mantém o lease da IA até o worker terminar o envio.

CREATE OR REPLACE FUNCTION public.campanha_ia_consume_response_turn(
  p_campanha_lead_id uuid,
  p_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A validação acontece antes de cada envio, mas o lease não é liberado aqui.
  -- Liberá-lo antes do fim permitia que eventos em rajada abrissem várias
  -- rodadas concorrentes e mandassem respostas duplicadas.
  UPDATE public.campanha_leads
  SET updated_at = now()
  WHERE id = p_campanha_lead_id
    AND ai_response_lease_token = p_token
    AND ai_response_lease_until >= now()
    AND status <> 'descartado'::public.status_lead_campanha
    AND coalesce(humano_assumiu, false) = false
    AND coalesce(aguarda_resposta_humana, false) = false;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.campanha_ia_release_response_turn(
  p_campanha_lead_id uuid,
  p_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campanha_leads
  SET ai_response_lease_token = NULL,
      ai_response_lease_until = NULL,
      updated_at = now()
  WHERE id = p_campanha_lead_id
    AND ai_response_lease_token = p_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.campanha_ia_release_response_turn(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campanha_ia_release_response_turn(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.campanha_ia_consume_response_turn(uuid, uuid) IS
  'Valida o lease da IA sem liberá-lo; a liberação ocorre após o worker terminar o envio.';
