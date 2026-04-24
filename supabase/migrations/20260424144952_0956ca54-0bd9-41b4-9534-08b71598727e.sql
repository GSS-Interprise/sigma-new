
CREATE OR REPLACE FUNCTION public.reprocessar_acompanhamento()
RETURNS TABLE(destino text, quantidade bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_has_reply boolean;
  v_has_operator boolean;
  v_last_incoming timestamptz;
  v_last_outgoing_op timestamptz;
  v_last_disparo timestamptz;
  v_new_status text;
  v_motivo text;
  v_mov_conv int := 0;
  v_mov_sem int := 0;
  v_mov_kept int := 0;
  v_mov_renamed int := 0;
BEGIN
  PERFORM set_config('app.automacao_sistema', '1', true);

  FOR v_lead IN
    SELECT id, status, ultimo_disparo_em, ultima_resposta_em
      FROM public.leads
     WHERE status IN ('Acompanhamento', 'Contatados')
       AND COALESCE(automacao_status_travada, false) = false
  LOOP
    SELECT max(m.sent_at) INTO v_last_incoming
      FROM public.sigzap_messages m
      JOIN public.sigzap_conversations c ON c.id = m.conversation_id
     WHERE c.lead_id = v_lead.id AND m.from_me = false;

    SELECT max(m.sent_at) INTO v_last_outgoing_op
      FROM public.sigzap_messages m
      JOIN public.sigzap_conversations c ON c.id = m.conversation_id
     WHERE c.lead_id = v_lead.id
       AND m.from_me = true
       AND m.sent_by_user_id IS NOT NULL;

    v_last_disparo := v_lead.ultimo_disparo_em;
    v_has_reply := v_last_incoming IS NOT NULL;
    v_has_operator := v_last_outgoing_op IS NOT NULL;

    v_new_status := NULL;
    v_motivo := NULL;

    IF v_has_reply THEN
      v_new_status := 'em_conversa';
      v_motivo := 'Reprocessamento em lote: lead já respondeu';
    ELSIF v_has_operator THEN
      v_new_status := 'em_conversa';
      v_motivo := 'Reprocessamento em lote: operador já enviou mensagem';
    ELSIF v_last_disparo IS NOT NULL AND v_last_disparo < now() - interval '24 hours' THEN
      v_new_status := 'sem_resposta';
      v_motivo := 'Reprocessamento em lote: 24h sem resposta';
    END IF;

    IF v_new_status IS NULL OR v_new_status = v_lead.status THEN
      IF v_lead.status = 'Contatados' THEN
        UPDATE public.leads
           SET status = 'Acompanhamento',
               ultima_resposta_em = COALESCE(ultima_resposta_em, v_last_incoming)
         WHERE id = v_lead.id;
        INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
        VALUES (v_lead.id, 'status_alterado', 'Reprocessamento: Contatados → Acompanhamento',
                jsonb_build_object(
                  'automacao_kanban', true,
                  'origem', 'sistema',
                  'motivo', 'Reprocessamento em lote: normalização de coluna',
                  'status_anterior', 'Contatados',
                  'status_novo', 'Acompanhamento'
                ));
        v_mov_renamed := v_mov_renamed + 1;
      ELSE
        v_mov_kept := v_mov_kept + 1;
      END IF;
      CONTINUE;
    END IF;

    UPDATE public.leads
       SET status = v_new_status,
           ultima_resposta_em = CASE WHEN v_has_reply THEN v_last_incoming ELSE ultima_resposta_em END
     WHERE id = v_lead.id;

    INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
    VALUES (v_lead.id, 'status_alterado',
            format('Reprocessamento: %s → %s', v_lead.status, v_new_status),
            jsonb_build_object(
              'automacao_kanban', true,
              'origem', 'sistema',
              'motivo', v_motivo,
              'status_anterior', v_lead.status,
              'status_novo', v_new_status,
              'ultima_resposta_em', v_last_incoming,
              'ultimo_disparo_em', v_last_disparo
            ));

    IF v_new_status = 'em_conversa' THEN
      v_mov_conv := v_mov_conv + 1;
    ELSE
      v_mov_sem := v_mov_sem + 1;
    END IF;
  END LOOP;

  destino := 'em_conversa';                 quantidade := v_mov_conv;    RETURN NEXT;
  destino := 'sem_resposta';                quantidade := v_mov_sem;     RETURN NEXT;
  destino := 'Acompanhamento (mantido)';    quantidade := v_mov_kept;    RETURN NEXT;
  destino := 'Contatados→Acompanhamento';   quantidade := v_mov_renamed; RETURN NEXT;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.reprocessar_acompanhamento() LOOP
    RAISE NOTICE '[REPROC] % = %', r.destino, r.quantidade;
  END LOOP;
END $$;
