-- Reconciliação de entregas oficiais (Chakra/Twilio).
-- A API pode aceitar uma mensagem e rejeitá-la depois via webhook. Antes disso,
-- a campanha contava a tentativa como envio definitivo e não tinha uma fila
-- de retry. Estes campos tornam o estado do provedor explícito e auditável.

ALTER TABLE public.campanha_leads
  ADD COLUMN IF NOT EXISTS envio_status text NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_erro_codigo text,
  ADD COLUMN IF NOT EXISTS ultimo_erro_mensagem text,
  ADD COLUMN IF NOT EXISTS envio_confirmado_at timestamptz;

ALTER TABLE public.sigzap_messages
  ADD COLUMN IF NOT EXISTS campanha_lead_id uuid
    REFERENCES public.campanha_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campanha_leads_retry_queue
  ON public.campanha_leads (campanha_id, status, next_retry_at)
  WHERE status = 'frio' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sigzap_messages_campanha_lead
  ON public.sigzap_messages (campanha_lead_id)
  WHERE campanha_lead_id IS NOT NULL;

-- Conta a tentativa no mesmo lock em que o lead passa para pending. Isso
-- elimina a corrida entre a resposta 200 da API e o webhook de falha.
CREATE OR REPLACE FUNCTION public.account_whatsapp_campaign_send(
  p_campanha_lead_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead campanha_leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_lead.envio_status NOT IN ('pending', 'confirmed') THEN
    UPDATE public.campanhas
    SET disparos_enviados = coalesce(disparos_enviados, 0) + 1,
        updated_at = now()
    WHERE id = v_lead.campanha_id;
  END IF;
  UPDATE public.campanha_leads
  SET envio_status = 'pending', next_retry_at = NULL, erro_envio = NULL, updated_at = now()
  WHERE id = v_lead.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.account_whatsapp_campaign_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_whatsapp_campaign_send(uuid) TO service_role;

-- Dados antigos: toda mensagem oficial que chegou a ser criada no Sigma era
-- considerada confirmada até o webhook poder provar o contrário.
UPDATE public.campanha_leads
SET envio_status = 'confirmed'
WHERE envio_status = 'not_sent'
  AND data_primeiro_contato IS NOT NULL;

-- Vincula mensagens históricas à oportunidade pelo conversation_id. A coluna
-- passa a ser preenchida diretamente pelo Edge Function para os novos envios.
UPDATE public.sigzap_messages sm
SET campanha_lead_id = cl.id
FROM public.campanha_leads cl
WHERE sm.campanha_lead_id IS NULL
  AND sm.from_me = true
  AND sm.provider IN ('chakra', 'twilio')
  AND cl.conversa_id = sm.conversation_id;

-- Identifica as rejeições Meta já recebidas e coloca somente falhas de
-- elegibilidade de pagamento na fila. 131026 (número inexistente/indisponível)
-- é permanente e não deve ser repetido.
CREATE TEMP TABLE _whatsapp_payment_retry_leads ON COMMIT DROP AS
SELECT DISTINCT cl.id
FROM public.campanha_leads cl
JOIN public.sigzap_messages sm ON sm.campanha_lead_id = cl.id
JOIN public.whatsapp_chakra_webhook_events ev
  ON ev.phone_number_id IS NOT NULL
 AND ev.event_type = 'status'
 AND (ev.payload->>'deliveryStatus') = 'FAILED'
 AND (ev.payload->'errorContext'->'providerPayload'->>'code') = '131042'
 AND (
   sm.provider_message_id = ev.payload->>'externalId'
   OR sm.wa_message_id = ev.payload->>'externalId'
   OR sm.raw_payload->>'whatsappMessageId' = ev.payload->>'externalId'
 )
WHERE cl.status <> 'descartado';

UPDATE public.campanha_leads cl
SET envio_status = 'retry_wait',
    retry_count = 1,
    next_retry_at = now(),
    ultimo_erro_codigo = '131042',
    ultimo_erro_mensagem = 'Pagamento da conta Meta foi regularizado; reenvio programado.',
    erro_envio = '131042 · Pagamento Meta pendente/recém-regularizado; aguardando retentativa.',
    status = 'frio',
    data_primeiro_contato = NULL,
    data_ultimo_contato = NULL,
    data_status = now(),
    updated_at = now()
FROM _whatsapp_payment_retry_leads retry
WHERE cl.id = retry.id;

-- O contador de "enviados" representa contatos que ainda não falharam. A
-- reconciliação histórica remove as rejeições já registradas e as move para
-- a fila de retentativa.
WITH counts AS (
  SELECT cl.campanha_id, count(*)::integer AS total
  FROM public.campanha_leads cl
  JOIN _whatsapp_payment_retry_leads retry ON retry.id = cl.id
  GROUP BY cl.campanha_id
)
UPDATE public.campanhas c
SET disparos_enviados = greatest(coalesce(c.disparos_enviados, 0) - counts.total, 0),
    disparos_falhas = coalesce(c.disparos_falhas, 0) + counts.total,
    updated_at = now()
FROM counts
WHERE c.id = counts.campanha_id;

-- Função única para o webhook atualizar a oportunidade e os contadores de
-- forma idempotente. Ela devolve se uma nova tentativa deve ser agendada.
CREATE OR REPLACE FUNCTION public.reconcile_whatsapp_delivery(
  p_campanha_lead_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead campanha_leads%ROWTYPE;
  v_status text := lower(coalesce(p_status, ''));
  v_code text := nullif(trim(p_error_code), '');
  v_message text := nullif(trim(p_error_message), '');
  v_retryable boolean := false;
  v_next timestamptz;
  v_was_counted boolean;
  v_new_status text;
BEGIN
  IF p_campanha_lead_id IS NULL OR v_status = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_arguments');
  END IF;

  SELECT * INTO v_lead
  FROM public.campanha_leads
  WHERE id = p_campanha_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_lead_not_found');
  END IF;

  v_was_counted := v_lead.envio_status IN ('pending', 'confirmed');

  IF v_status IN ('sent', 'delivered', 'read', 'accepted') THEN
    -- O processador incrementa o contador quando a API aceita o POST. O
    -- webhook apenas confirma esse envio; não incrementamos aqui para evitar
    -- dupla contagem (inclusive quando chega SENT e depois DELIVERED).
    UPDATE public.campanha_leads
    SET envio_status = 'confirmed',
        envio_confirmado_at = coalesce(envio_confirmado_at, now()),
        next_retry_at = NULL,
        updated_at = now()
    WHERE id = v_lead.id;
    RETURN jsonb_build_object('ok', true, 'action', 'confirmed');
  END IF;

  IF v_status NOT IN ('failed', 'undelivered', 'error') THEN
    RETURN jsonb_build_object('ok', true, 'action', 'ignored');
  END IF;

  v_retryable := v_code IS DISTINCT FROM '131026'
    AND coalesce(v_lead.retry_count, 0) < 3;
  IF v_retryable THEN
    v_next := now() + make_interval(mins => least(60, 15 * greatest(coalesce(v_lead.retry_count, 0), 1)));
    v_new_status := 'retry_wait';
  ELSE
    v_next := NULL;
    v_new_status := 'failed_permanent';
  END IF;

  IF v_was_counted THEN
    UPDATE public.campanhas
    SET disparos_enviados = greatest(coalesce(disparos_enviados, 0) - 1, 0),
        disparos_falhas = coalesce(disparos_falhas, 0) + 1,
        updated_at = now()
    WHERE id = v_lead.campanha_id;
  END IF;

  UPDATE public.campanha_leads
  SET envio_status = v_new_status,
      retry_count = coalesce(retry_count, 0) + 1,
      next_retry_at = v_next,
      ultimo_erro_codigo = v_code,
      ultimo_erro_mensagem = v_message,
      erro_envio = coalesce(v_code || ' · ' || v_message, 'Falha no provedor de WhatsApp'),
      status = CASE WHEN v_retryable THEN 'frio'::status_lead_campanha
                    WHEN v_code = '131026' THEN 'sem_whatsapp'::status_lead_campanha
                    ELSE status END,
      data_primeiro_contato = CASE WHEN v_retryable THEN NULL ELSE data_primeiro_contato END,
      data_ultimo_contato = CASE WHEN v_retryable THEN NULL ELSE data_ultimo_contato END,
      data_status = now(),
      updated_at = now()
  WHERE id = v_lead.id;

  RETURN jsonb_build_object(
    'ok', true,
    'action', CASE WHEN v_retryable THEN 'queued_retry' ELSE 'permanent_failure' END,
    'next_retry_at', v_next,
    'code', v_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_whatsapp_delivery(uuid, text, text, text) TO service_role;

COMMENT ON COLUMN public.campanha_leads.envio_status IS
  'Estado reconciliado do provedor: not_sent, pending, confirmed, retry_wait ou failed_permanent.';
COMMENT ON COLUMN public.campanha_leads.erro_envio IS
  'Última falha técnica legível; não deve ser interpretada como envio confirmado.';

-- Limite solicitado para o piloto atual.
UPDATE public.campanhas
SET limite_diario_campanha = 100,
    updated_at = now()
WHERE id = 'fc3ee284-db0e-457b-a456-2eb6f1a88505';
