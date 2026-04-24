
CREATE OR REPLACE FUNCTION public.test_automacao_kanban()
RETURNS TABLE(cenario text, resultado text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_conv_id uuid;
  v_contact_id uuid;
  v_instance_id uuid;
  v_status text;
  v_travada boolean;
  v_count int;
  v_test_tag text := 'TEST_AUTOMACAO_' || gen_random_uuid()::text;
  v_phone text;
BEGIN
  PERFORM set_config('app.automacao_sistema', '1', true);

  SELECT id INTO v_instance_id FROM public.sigzap_instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma sigzap_instance disponível para teste';
  END IF;

  -- ========= helper macro inline: cria um lead + conversa nova =========
  -- (repetimos via blocos inline, plpgsql não suporta subprocedures)

  -- CENÁRIO 1: Disparo → Acompanhamento ---------------------------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164)
  VALUES (v_lead_id, v_test_tag, 'Novo', v_test_tag, v_phone);

  v_contact_id := gen_random_uuid();
  INSERT INTO public.sigzap_contacts (id, contact_jid, contact_phone)
  VALUES (v_contact_id, v_phone || '@s.whatsapp.net', v_phone);

  v_conv_id := gen_random_uuid();
  INSERT INTO public.sigzap_conversations (id, contact_id, instance_id, lead_id, status)
  VALUES (v_conv_id, v_contact_id, v_instance_id, v_lead_id, 'open');

  UPDATE public.leads SET ultimo_disparo_em = now() WHERE id = v_lead_id;
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Acompanhamento' THEN
    RAISE EXCEPTION 'C1 FAIL: esperava Acompanhamento, obteve %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_historico
   WHERE lead_id = v_lead_id
     AND (metadados->>'automacao_kanban')::boolean = true
     AND metadados->>'status_novo' = 'Acompanhamento';
  IF v_count < 1 THEN RAISE EXCEPTION 'C1 FAIL: histórico não registrou'; END IF;
  cenario := 'C1 disparo → Acompanhamento'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 2: Lead responde → em_conversa ------------------------------
  INSERT INTO public.sigzap_messages (conversation_id, wa_message_id, from_me, message_text, sent_at)
  VALUES (v_conv_id, gen_random_uuid()::text, false, 'oi, tenho interesse', now());
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'em_conversa' THEN
    RAISE EXCEPTION 'C2 FAIL: esperava em_conversa, obteve %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_historico
   WHERE lead_id = v_lead_id AND metadados->>'origem' = 'sistema' AND metadados->>'status_novo' = 'em_conversa';
  IF v_count < 1 THEN RAISE EXCEPTION 'C2 FAIL: histórico não registrou resposta'; END IF;
  cenario := 'C2 resposta → Conversação'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 3: Silêncio em em_conversa permanece em em_conversa ---------
  UPDATE public.leads
     SET ultimo_disparo_em = now() - interval '48 hours',
         ultima_resposta_em = now() - interval '36 hours'
   WHERE id = v_lead_id;
  PERFORM public.sweeper_acompanhamento_sem_resposta();
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'em_conversa' THEN
    RAISE EXCEPTION 'C3 FAIL: Conversação virou %', v_status;
  END IF;
  cenario := 'C3 silêncio em Conversação permanece'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 4: Operador envia msg → em_conversa -------------------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164)
  VALUES (v_lead_id, v_test_tag, 'Acompanhamento', v_test_tag, v_phone);
  v_contact_id := gen_random_uuid();
  INSERT INTO public.sigzap_contacts (id, contact_jid, contact_phone)
  VALUES (v_contact_id, v_phone || '@s.whatsapp.net', v_phone);
  v_conv_id := gen_random_uuid();
  INSERT INTO public.sigzap_conversations (id, contact_id, instance_id, lead_id, status)
  VALUES (v_conv_id, v_contact_id, v_instance_id, v_lead_id, 'open');

  INSERT INTO public.sigzap_messages (conversation_id, wa_message_id, from_me, message_text, sent_at, sent_by_user_id)
  VALUES (v_conv_id, gen_random_uuid()::text, true, 'olá doutor', now(), gen_random_uuid());
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'em_conversa' THEN
    RAISE EXCEPTION 'C4 FAIL: esperava em_conversa, obteve %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_historico
   WHERE lead_id = v_lead_id AND metadados->>'origem' = 'operador';
  IF v_count < 1 THEN RAISE EXCEPTION 'C4 FAIL: histórico não registrou'; END IF;
  cenario := 'C4 operador envia → Conversação'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 5: Timeout 24h → sem_resposta -------------------------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164)
  VALUES (v_lead_id, v_test_tag, 'Acompanhamento', v_test_tag, v_phone);
  v_contact_id := gen_random_uuid();
  INSERT INTO public.sigzap_contacts (id, contact_jid, contact_phone)
  VALUES (v_contact_id, v_phone || '@s.whatsapp.net', v_phone);
  v_conv_id := gen_random_uuid();
  INSERT INTO public.sigzap_conversations (id, contact_id, instance_id, lead_id, status)
  VALUES (v_conv_id, v_contact_id, v_instance_id, v_lead_id, 'open');

  UPDATE public.leads
     SET ultimo_disparo_em = now() - interval '30 hours', ultima_resposta_em = NULL
   WHERE id = v_lead_id;
  PERFORM public.sweeper_acompanhamento_sem_resposta();
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'sem_resposta' THEN
    RAISE EXCEPTION 'C5 FAIL: esperava sem_resposta, obteve %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.lead_historico
   WHERE lead_id = v_lead_id AND metadados->>'motivo' ILIKE '%24h%';
  IF v_count < 1 THEN RAISE EXCEPTION 'C5 FAIL: histórico não registrou 24h'; END IF;
  cenario := 'C5 timeout 24h → sem_resposta'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 6: Resposta tardia em sem_resposta → em_conversa ------------
  INSERT INTO public.sigzap_messages (conversation_id, wa_message_id, from_me, message_text, sent_at)
  VALUES (v_conv_id, gen_random_uuid()::text, false, 'desculpe a demora', now());
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'em_conversa' THEN
    RAISE EXCEPTION 'C6 FAIL: esperava em_conversa, obteve %', v_status;
  END IF;
  cenario := 'C6 resposta tardia → Conversação'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 7: Novo disparo em sem_resposta → Acompanhamento ------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164, ultimo_disparo_em)
  VALUES (v_lead_id, v_test_tag, 'sem_resposta', v_test_tag, v_phone, now() - interval '40 hours');

  UPDATE public.leads SET ultimo_disparo_em = now() WHERE id = v_lead_id;
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Acompanhamento' THEN
    RAISE EXCEPTION 'C7 FAIL: esperava Acompanhamento, obteve %', v_status;
  END IF;
  cenario := 'C7 novo disparo em sem_resposta → Acompanhamento'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 8: Coluna final (Aprovados) imune ---------------------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164, ultimo_disparo_em)
  VALUES (v_lead_id, v_test_tag, 'Aprovados', v_test_tag, v_phone, now() - interval '48 hours');
  v_contact_id := gen_random_uuid();
  INSERT INTO public.sigzap_contacts (id, contact_jid, contact_phone)
  VALUES (v_contact_id, v_phone || '@s.whatsapp.net', v_phone);
  v_conv_id := gen_random_uuid();
  INSERT INTO public.sigzap_conversations (id, contact_id, instance_id, lead_id, status)
  VALUES (v_conv_id, v_contact_id, v_instance_id, v_lead_id, 'open');

  PERFORM public.sweeper_acompanhamento_sem_resposta();
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Aprovados' THEN
    RAISE EXCEPTION 'C8 FAIL: Aprovados virou %', v_status;
  END IF;
  INSERT INTO public.sigzap_messages (conversation_id, wa_message_id, from_me, message_text, sent_at)
  VALUES (v_conv_id, gen_random_uuid()::text, false, 'obrigado', now());
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Aprovados' THEN
    RAISE EXCEPTION 'C8 FAIL: Aprovados virou % após resposta', v_status;
  END IF;
  cenario := 'C8 coluna final imune'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 9: Movimentação manual trava automação ----------------------
  v_lead_id := gen_random_uuid();
  v_phone   := '+5500' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
  INSERT INTO public.leads (id, nome, status, observacoes, phone_e164,
                            ultimo_disparo_em, automacao_status_travada)
  VALUES (v_lead_id, v_test_tag, 'Acompanhamento', v_test_tag, v_phone,
          now() - interval '30 hours', true);
  v_contact_id := gen_random_uuid();
  INSERT INTO public.sigzap_contacts (id, contact_jid, contact_phone)
  VALUES (v_contact_id, v_phone || '@s.whatsapp.net', v_phone);
  v_conv_id := gen_random_uuid();
  INSERT INTO public.sigzap_conversations (id, contact_id, instance_id, lead_id, status)
  VALUES (v_conv_id, v_contact_id, v_instance_id, v_lead_id, 'open');

  PERFORM public.sweeper_acompanhamento_sem_resposta();
  SELECT status, automacao_status_travada INTO v_status, v_travada
    FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Acompanhamento' OR v_travada <> true THEN
    RAISE EXCEPTION 'C9 FAIL: sweeper moveu lead travado (status=%, travada=%)', v_status, v_travada;
  END IF;
  INSERT INTO public.sigzap_messages (conversation_id, wa_message_id, from_me, message_text, sent_at)
  VALUES (v_conv_id, gen_random_uuid()::text, false, 'oi', now());
  SELECT status INTO v_status FROM public.leads WHERE id = v_lead_id;
  IF v_status <> 'Acompanhamento' THEN
    RAISE EXCEPTION 'C9 FAIL: travada virou % após resposta', v_status;
  END IF;
  cenario := 'C9 manual trava automação'; resultado := 'PASS'; RETURN NEXT;

  -- CENÁRIO 10: Novo disparo destrava -----------------------------------
  UPDATE public.leads SET ultimo_disparo_em = now() WHERE id = v_lead_id;
  SELECT automacao_status_travada INTO v_travada FROM public.leads WHERE id = v_lead_id;
  IF v_travada <> false THEN
    RAISE EXCEPTION 'C10 FAIL: não destravou';
  END IF;
  cenario := 'C10 novo disparo destrava'; resultado := 'PASS'; RETURN NEXT;

  -- CLEANUP -------------------------------------------------------------
  DELETE FROM public.sigzap_messages
   WHERE conversation_id IN (
     SELECT id FROM public.sigzap_conversations
      WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag)
   );
  DELETE FROM public.sigzap_conversations
   WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag);
  DELETE FROM public.sigzap_contacts
   WHERE contact_jid LIKE '+5500%@s.whatsapp.net'
     AND contact_phone IN (SELECT phone_e164 FROM public.leads WHERE observacoes = v_test_tag);
  DELETE FROM public.lead_historico
   WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag);
  DELETE FROM public.leads WHERE observacoes = v_test_tag;

  cenario := 'CLEANUP'; resultado := 'DONE'; RETURN NEXT;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    DELETE FROM public.sigzap_messages
     WHERE conversation_id IN (
       SELECT id FROM public.sigzap_conversations
        WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag)
     );
    DELETE FROM public.sigzap_conversations
     WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag);
    DELETE FROM public.sigzap_contacts
     WHERE contact_phone IN (SELECT phone_e164 FROM public.leads WHERE observacoes = v_test_tag);
    DELETE FROM public.lead_historico
     WHERE lead_id IN (SELECT id FROM public.leads WHERE observacoes = v_test_tag);
    DELETE FROM public.leads WHERE observacoes = v_test_tag;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$$;
