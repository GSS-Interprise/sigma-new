-- Uma mensagem recebida pode ser reenviada pelo provedor/webhook. A IA deve
-- processar cada msg_id uma única vez, independentemente do caminho de entrada.
CREATE TABLE IF NOT EXISTS public.campanha_ia_processed_messages (
  msg_id text PRIMARY KEY,
  phone text NOT NULL,
  instance_name text,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campanha_ia_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.campanha_ia_claim_message(
  p_msg_id text,
  p_phone text,
  p_instance_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _claimed text;
BEGIN
  IF NULLIF(trim(p_msg_id), '') IS NULL THEN
    RETURN true;
  END IF;

  INSERT INTO campanha_ia_processed_messages (
    msg_id, phone, instance_name, status, claimed_at, updated_at
  )
  VALUES (
    p_msg_id, p_phone, p_instance_name, 'processing', now(), now()
  )
  ON CONFLICT (msg_id) DO UPDATE
    SET phone = EXCLUDED.phone,
        instance_name = EXCLUDED.instance_name,
        status = 'processing',
        claimed_at = now(),
        completed_at = NULL,
        result = NULL,
        updated_at = now()
    -- Falhas podem ser tentadas novamente. Processamentos abandonados ganham
    -- uma nova tentativa depois do lease para não perder mensagem para sempre.
    WHERE campanha_ia_processed_messages.status = 'failed'
       OR (
         campanha_ia_processed_messages.status = 'processing'
         AND campanha_ia_processed_messages.claimed_at < now() - interval '5 minutes'
       )
  RETURNING msg_id INTO _claimed;

  RETURN _claimed IS NOT NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.campanha_ia_claim_message(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campanha_ia_claim_message(text, text, text) TO service_role;

CREATE INDEX IF NOT EXISTS idx_campanha_ia_processed_claimed
  ON public.campanha_ia_processed_messages (status, claimed_at);

COMMENT ON TABLE public.campanha_ia_processed_messages IS
  'Idempotência do respondedor de campanhas: um processamento por msg_id do WhatsApp.';
