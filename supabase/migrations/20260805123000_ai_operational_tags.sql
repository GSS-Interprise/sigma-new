-- Sinais operacionais gerados pela IA para a equipe identificar o próximo passo
-- sem abrir conversa por conversa. São tags normais do lead, portanto continuam
-- visíveis nos filtros, no card e no BI.
INSERT INTO public.lead_tag_catalog(label, slug, color, sort_order)
VALUES
  ('IA respondeu', 'ia-respondeu', 'cyan', 110),
  ('Resposta recebida', 'resposta-recebida', 'emerald', 120),
  ('Resposta automática', 'resposta-automatica', 'slate', 130),
  ('Aguardando equipe', 'aguardando-equipe', 'amber', 140),
  ('Lead quente', 'lead-quente', 'red', 150),
  ('Número inválido', 'numero-invalido', 'rose', 160),
  ('IA pausada', 'ia-pausada', 'blue', 170),
  ('Briefing para revisar', 'briefing-para-revisar', 'orange', 180)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label,
      color = EXCLUDED.color,
      active = true,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

COMMENT ON TABLE public.lead_tag_catalog IS
  'Vocabulário controlado para tags manuais e sinais operacionais da IA.';

-- Guarda o vínculo canônico da campanha com a conversa oficial/Evolution no
-- primeiro inbound. Isso evita que o histórico fique apenas no JSON legado.
CREATE OR REPLACE FUNCTION public.sync_campaign_lead_on_inbound_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_chip_id uuid;
  v_provider text;
  v_external_ref text;
  v_message_at timestamptz := coalesce(NEW.sent_at, now());
BEGIN
  IF NEW.from_me IS NOT FALSE THEN
    RETURN NEW;
  END IF;

  SELECT conv.lead_id, inst.chip_id, inst.provider, inst.external_ref
    INTO v_lead_id, v_chip_id, v_provider, v_external_ref
    FROM public.sigzap_conversations conv
    JOIN public.sigzap_instances inst ON inst.id = conv.instance_id
   WHERE conv.id = NEW.conversation_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.campanha_leads cl
     SET status = 'em_conversa',
         conversa_id = NEW.conversation_id,
         data_ultimo_contato = greatest(coalesce(cl.data_ultimo_contato, '-infinity'::timestamptz), v_message_at),
         data_status = CASE WHEN cl.status IS DISTINCT FROM 'em_conversa' THEN v_message_at ELSE cl.data_status END,
         updated_at = now()
    FROM public.campanhas camp
    LEFT JOIN public.whatsapp_official_senders sender ON sender.id = camp.official_sender_id
   WHERE cl.campanha_id = camp.id
     AND cl.lead_id = v_lead_id
     AND camp.status::text = 'ativa'
     AND cl.status IN ('frio', 'contatado', 'sem_resposta', 'em_conversa')
     AND (
       (v_provider = 'evolution' AND v_chip_id IS NOT NULL AND (
          camp.chip_id = v_chip_id OR camp.chip_fallback_id = v_chip_id OR v_chip_id = ANY(coalesce(camp.chip_ids, '{}'::uuid[]))
       ))
       OR
       (v_provider = 'twilio' AND camp.whatsapp_provider = 'twilio' AND sender.sender_sid = v_external_ref)
     );

  RETURN NEW;
END;
$$;

-- Merge atômico: não deixa duas mensagens simultâneas apagarem tags uma da outra.
CREATE OR REPLACE FUNCTION public.append_lead_operational_tags(
  p_lead_id uuid,
  p_tags text[]
) RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text[];
  v_merged text[];
BEGIN
  SELECT coalesce(tags, '{}'::text[])
    INTO v_current
    FROM public.leads
   WHERE id = p_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  SELECT coalesce(array_agg(value ORDER BY lower(value), value), '{}'::text[])
    INTO v_merged
    FROM (
      SELECT DISTINCT btrim(value) AS value
      FROM unnest(v_current || coalesce(p_tags, '{}'::text[])) AS item(value)
      WHERE length(btrim(value)) > 0
    ) deduped;

  UPDATE public.leads
     SET tags = v_merged,
         updated_at = now()
   WHERE id = p_lead_id;
  RETURN v_merged;
END;
$$;

REVOKE ALL ON FUNCTION public.append_lead_operational_tags(uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_lead_operational_tags(uuid, text[])
  TO service_role;
