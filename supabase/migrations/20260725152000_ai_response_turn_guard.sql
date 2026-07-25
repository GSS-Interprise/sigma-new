-- Lease curto entre geração e envio: reduz a janela em que uma pessoa assume
-- enquanto a IA ainda está preparando a resposta.
ALTER TABLE public.campanha_leads
  ADD COLUMN IF NOT EXISTS ai_response_lease_token uuid,
  ADD COLUMN IF NOT EXISTS ai_response_lease_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_campanha_leads_ai_response_lease
  ON public.campanha_leads(ai_response_lease_until)
  WHERE ai_response_lease_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.campanha_ia_claim_response_turn(
  p_campanha_lead_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid := gen_random_uuid();
BEGIN
  UPDATE public.campanha_leads
  SET
    ai_response_lease_token = v_token,
    ai_response_lease_until = now() + interval '3 minutes'
  WHERE id = p_campanha_lead_id
    AND coalesce(humano_assumiu, false) = false
    AND coalesce(aguarda_resposta_humana, false) = false
    AND (
      ai_response_lease_token IS NULL
      OR ai_response_lease_until < now()
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.campanha_ia_consume_response_turn(
  p_campanha_lead_id uuid,
  p_token uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campanha_leads
  SET
    ai_response_lease_token = NULL,
    ai_response_lease_until = NULL
  WHERE id = p_campanha_lead_id
    AND ai_response_lease_token = p_token
    AND ai_response_lease_until >= now()
    AND coalesce(humano_assumiu, false) = false
    AND coalesce(aguarda_resposta_humana, false) = false;
  RETURN FOUND;
END;
$$;

-- Assumir invalida qualquer resposta ainda não enviada.
CREATE OR REPLACE FUNCTION public.prospeccao_assumir(
  p_campanha_lead_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _atual uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_autenticado');
  END IF;

  SELECT assumido_por
    INTO _atual
    FROM campanha_leads
   WHERE id = p_campanha_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado');
  END IF;

  IF _atual IS NOT NULL AND _atual <> _uid AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ja_assumido', 'por', _atual);
  END IF;

  UPDATE campanha_leads
     SET assumido_por = _uid,
         assumido_em = now(),
         humano_assumiu = true,
         ai_response_lease_token = NULL,
         ai_response_lease_until = NULL,
         updated_at = now()
   WHERE id = p_campanha_lead_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assumido_por', _uid,
    'ia_pausada', true
  );
END
$function$;

REVOKE ALL ON FUNCTION public.campanha_ia_claim_response_turn(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campanha_ia_consume_response_turn(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campanha_ia_claim_response_turn(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.campanha_ia_consume_response_turn(uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.campanha_ia_consume_response_turn(uuid, uuid) IS
  'Última barreira antes do envio: falha quando atendimento humano ou pausa invalidou o turno da IA.';
