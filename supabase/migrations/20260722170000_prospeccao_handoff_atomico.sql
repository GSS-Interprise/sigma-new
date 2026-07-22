-- Assumir um lead significa transferir a conversa da IA para uma pessoa.
-- Manter as duas flags na mesma transacao evita respostas concorrentes.
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
         assumido_em = NOW(),
         humano_assumiu = true,
         updated_at = NOW()
   WHERE id = p_campanha_lead_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assumido_por', _uid,
    'ia_pausada', true
  );
END
$function$;

COMMENT ON FUNCTION public.prospeccao_assumir(uuid, boolean) IS
  'Assume o lead e pausa a IA atomicamente para impedir respostas concorrentes.';
