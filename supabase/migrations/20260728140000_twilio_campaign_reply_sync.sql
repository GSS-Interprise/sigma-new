-- Extend campaign reply tracking to official Twilio conversations.

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
         data_ultimo_contato = greatest(
           coalesce(cl.data_ultimo_contato, '-infinity'::timestamptz),
           v_message_at
         ),
         data_status = CASE
           WHEN cl.status IS DISTINCT FROM 'em_conversa' THEN v_message_at
           ELSE cl.data_status
         END,
         updated_at = now()
    FROM public.campanhas camp
    LEFT JOIN public.whatsapp_official_senders sender
      ON sender.id = camp.official_sender_id
   WHERE cl.campanha_id = camp.id
     AND cl.lead_id = v_lead_id
     AND camp.status::text = 'ativa'
     AND cl.status IN ('frio', 'contatado', 'sem_resposta', 'em_conversa')
     AND (
       (
         v_provider = 'evolution'
         AND v_chip_id IS NOT NULL
         AND (
           camp.chip_id = v_chip_id
           OR camp.chip_fallback_id = v_chip_id
           OR v_chip_id = ANY(coalesce(camp.chip_ids, '{}'::uuid[]))
         )
       )
       OR (
         v_provider = 'twilio'
         AND camp.whatsapp_provider = 'twilio'
         AND sender.sender_sid = v_external_ref
       )
     );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban_full AS
SELECT cl.id AS campanha_lead_id,
    cl.campanha_id,
    cl.lead_id,
    cl.etapa_acompanhamento,
    cl.status,
    cl.assumido_por,
    cl.assumido_em,
    cl.validacoes,
    cl.resultado_final,
    cl.motivo_perdido,
    cl.data_primeiro_contato,
    cl.data_ultimo_contato,
    cl.data_status,
    cl.updated_at,
    cl.humano_assumiu,
    jsonb_array_length(COALESCE(cl.historico_conversa, '[]'::jsonb)) AS msgs_total,
    public._prospeccao_validacoes_ok(COALESCE(cl.validacoes, '{}'::jsonb)) AS validacoes_ok,
    l.nome AS lead_nome,
    l.phone_e164 AS lead_phone,
    l.especialidade AS lead_especialidade,
    l.cidade AS lead_cidade,
    l.uf AS lead_uf,
    l.classificacao AS lead_classificacao,
    l.opt_out AS lead_opt_out,
    c.nome AS campanha_nome,
    c.briefing_ia ->> 'handoff_nome' AS handoff_nome,
    c.briefing_ia ->> 'nome_servico' AS servico,
    c.briefing_ia ->> 'cidade' AS servico_cidade,
    p.nome_completo AS assumido_por_nome,
    p.email AS assumido_por_email,
    bi.observacoes_ia AS perfil_resumo,
    bi.modalidade_preferida AS perfil_modalidade,
    bi.valor_minimo_aceitavel AS perfil_valor_min,
    bi.confianca_score AS perfil_confianca,
    c.tipo_envio AS tipo_envio,
    cl.strategy_id,
    s.nome AS strategy_name,
    s.status AS strategy_status,
    coalesce(conversation_state.unread_messages, 0)::integer AS unread_messages,
    conversation_state.last_incoming_at
FROM public.campanha_leads cl
JOIN public.leads l ON l.id = cl.lead_id
JOIN public.campanhas c ON c.id = cl.campanha_id
LEFT JOIN public.campaign_strategies s ON s.id = cl.strategy_id
LEFT JOIN public.profiles p ON p.id = cl.assumido_por
LEFT JOIN public.banco_interesse_leads bi ON bi.lead_id = cl.lead_id
LEFT JOIN LATERAL (
  SELECT
    sum(state.unread_count)::integer AS unread_messages,
    max(state.last_incoming_at) AS last_incoming_at
  FROM (
    SELECT
      coalesce(conv.unread_count, 0) AS unread_count,
      (
        SELECT max(msg.sent_at)
        FROM public.sigzap_messages msg
        WHERE msg.conversation_id = conv.id
          AND msg.from_me = false
      ) AS last_incoming_at
    FROM public.sigzap_conversations conv
    JOIN public.sigzap_instances inst ON inst.id = conv.instance_id
    LEFT JOIN public.whatsapp_official_senders sender
      ON sender.sender_sid = inst.external_ref
    WHERE conv.lead_id = cl.lead_id
      AND (
        (
          inst.provider = 'evolution'
          AND (
            c.chip_id = inst.chip_id
            OR c.chip_fallback_id = inst.chip_id
            OR inst.chip_id = ANY(coalesce(c.chip_ids, '{}'::uuid[]))
          )
        )
        OR (
          inst.provider = 'twilio'
          AND c.whatsapp_provider = 'twilio'
          AND c.official_sender_id = sender.id
        )
      )
  ) state
) conversation_state ON true;

CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban AS
SELECT *
FROM public.vw_acompanhamento_kanban_full
WHERE etapa_acompanhamento IS NOT NULL
   OR (
     tipo_envio = 'manual'
     AND status IN ('frio', 'contatado', 'sem_resposta', 'em_conversa', 'quente')
   );

GRANT SELECT ON public.vw_acompanhamento_kanban_full TO authenticated, service_role;
GRANT SELECT ON public.vw_acompanhamento_kanban TO authenticated, service_role;

COMMENT ON FUNCTION public.sync_campaign_lead_on_inbound_message IS
  'Moves an active Evolution or Twilio campaign lead to em_conversa on inbound reply.';
