
-- 1) Trigger function: ao inserir mensagem outbound, abrir raia WhatsApp e promover lead
CREATE OR REPLACE FUNCTION public.trg_sigzap_outbound_marca_contactado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id UUID;
  v_conv_id UUID;
  v_already_outbound BOOLEAN;
  v_cp RECORD;
BEGIN
  IF NEW.from_me IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_conv_id := NEW.conversation_id;
  IF v_conv_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO v_lead_id
  FROM public.sigzap_conversations
  WHERE id = v_conv_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência: só age na PRIMEIRA mensagem outbound da conversa
  SELECT EXISTS (
    SELECT 1 FROM public.sigzap_messages
    WHERE conversation_id = v_conv_id
      AND from_me = TRUE
      AND id <> NEW.id
  ) INTO v_already_outbound;

  IF v_already_outbound THEN
    RETURN NEW;
  END IF;

  -- Para cada proposta ativa contendo o lead, abrir raia WhatsApp se ainda não houver uma aberta
  FOR v_cp IN
    SELECT cp.id AS campanha_proposta_id
    FROM public.campanha_propostas cp
    JOIN public.disparo_lista_itens dli
      ON dli.lista_id = cp.lista_id AND dli.lead_id = v_lead_id
    WHERE cp.status NOT IN ('encerrada', 'cancelada')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.campanha_proposta_lead_canais
      WHERE campanha_proposta_id = v_cp.campanha_proposta_id
        AND lead_id = v_lead_id
        AND canal = 'whatsapp'
        AND status_final = 'aberto'
    ) THEN
      INSERT INTO public.campanha_proposta_lead_canais (
        campanha_proposta_id, lead_id, canal, status_final, entrou_em
      ) VALUES (
        v_cp.campanha_proposta_id, v_lead_id, 'whatsapp', 'aberto', now()
      );
    END IF;
  END LOOP;

  -- Promove status do lead se ainda for "Novo" / nulo
  UPDATE public.leads
  SET status = 'Contatados', updated_at = now()
  WHERE id = v_lead_id
    AND (status IS NULL OR status IN ('Novo', 'novo', ''));

  -- Histórico
  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    v_lead_id,
    'mensagem_enviada',
    'Primeira mensagem WhatsApp enviada — lead marcado como contactado',
    jsonb_build_object(
      'conversation_id', v_conv_id,
      'sigzap_message_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG '[trg_sigzap_outbound_marca_contactado] erro: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sigzap_outbound_after_insert ON public.sigzap_messages;
CREATE TRIGGER trg_sigzap_outbound_after_insert
AFTER INSERT ON public.sigzap_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_sigzap_outbound_marca_contactado();

-- 2) RPC: enviar lead para próxima fase da cascata
CREATE OR REPLACE FUNCTION public.enviar_lead_proxima_fase(
  p_campanha_proposta_id UUID,
  p_lead_id UUID,
  p_canal_atual TEXT,
  p_motivo TEXT DEFAULT 'Avançado para próxima fase'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proximo TEXT;
  v_new_id UUID;
BEGIN
  v_proximo := CASE p_canal_atual
    WHEN 'whatsapp' THEN 'email'
    WHEN 'trafego_pago' THEN 'email'
    WHEN 'email' THEN 'instagram'
    WHEN 'instagram' THEN 'ligacao'
    WHEN 'ligacao' THEN 'linkedin'
    WHEN 'linkedin' THEN 'tiktok'
    ELSE NULL
  END;

  IF v_proximo IS NULL THEN
    RAISE EXCEPTION 'Canal % não tem próxima fase na cascata', p_canal_atual;
  END IF;

  -- Fecha raia atual
  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      proximo_canal = v_proximo,
      status_final = 'transferido'
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal_atual
    AND status_final = 'aberto';

  -- Abre próxima
  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, criado_por, status_final, entrou_em
  ) VALUES (
    p_campanha_proposta_id, p_lead_id, v_proximo, auth.uid(), 'aberto', now()
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    p_lead_id,
    'canal_transferido',
    'Avançado de ' || p_canal_atual || ' para ' || v_proximo,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal_origem', p_canal_atual,
      'canal_destino', v_proximo,
      'motivo', p_motivo
    )
  );

  RETURN v_new_id;
END;
$$;

-- 3) Backfill: para conversas com lead vinculado e mensagem outbound, abrir raia se faltando
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT conv.lead_id, cp.id AS campanha_proposta_id, MIN(m.created_at) AS primeira_em
    FROM public.sigzap_conversations conv
    JOIN public.sigzap_messages m
      ON m.conversation_id = conv.id AND m.from_me = TRUE
    JOIN public.disparo_lista_itens dli ON dli.lead_id = conv.lead_id
    JOIN public.campanha_propostas cp
      ON cp.lista_id = dli.lista_id
     AND cp.status NOT IN ('encerrada', 'cancelada')
    WHERE conv.lead_id IS NOT NULL
    GROUP BY conv.lead_id, cp.id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.campanha_proposta_lead_canais
      WHERE campanha_proposta_id = r.campanha_proposta_id
        AND lead_id = r.lead_id
        AND canal = 'whatsapp'
        AND status_final = 'aberto'
    ) THEN
      INSERT INTO public.campanha_proposta_lead_canais (
        campanha_proposta_id, lead_id, canal, status_final, entrou_em
      ) VALUES (
        r.campanha_proposta_id, r.lead_id, 'whatsapp', 'aberto', r.primeira_em
      );
    END IF;
  END LOOP;

  UPDATE public.leads
  SET status = 'Contatados', updated_at = now()
  WHERE id IN (
    SELECT DISTINCT conv.lead_id
    FROM public.sigzap_conversations conv
    JOIN public.sigzap_messages m
      ON m.conversation_id = conv.id AND m.from_me = TRUE
    WHERE conv.lead_id IS NOT NULL
  )
  AND (status IS NULL OR status IN ('Novo', 'novo', ''));
END $$;
