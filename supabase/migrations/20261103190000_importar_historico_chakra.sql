-- Histórico do celular (eventos history da Chakra) vira mensagem na caixa de entrada. Os 3 gatilhos
-- abaixo ganham uma trava que só vale durante a importação (app.importando_historico).

CREATE OR REPLACE FUNCTION public.fn_sigzap_message_automacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_status text;
  v_travada boolean;
BEGIN

  -- importação do histórico do celular (importar_historico_chakra): mensagem antiga não mexe em lead nem campanha
  IF current_setting('app.importando_historico', true) = '1' THEN RETURN NEW; END IF;
  SELECT c.lead_id INTO v_lead_id
    FROM public.sigzap_conversations c
   WHERE c.id = NEW.conversation_id;

  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, automacao_status_travada
    INTO v_status, v_travada
    FROM public.leads
   WHERE id = v_lead_id;

  PERFORM set_config('app.automacao_sistema', '1', true);

  IF NEW.from_me = false THEN
    UPDATE public.leads
       SET ultima_resposta_em = coalesce(NEW.sent_at, now()),
           updated_at = now(),
           status = CASE
             WHEN v_travada = false
              AND status IN ('Acompanhamento', 'sem_resposta', 'Novo')
             THEN 'em_conversa'
             ELSE status
           END
     WHERE id = v_lead_id;

    IF v_travada = false AND v_status IN ('Acompanhamento', 'sem_resposta', 'Novo') THEN
      PERFORM public.fn_log_status_change(
        v_lead_id,
        v_status,
        'em_conversa',
        'sistema',
        'Lead respondeu no WhatsApp — movido para Conversação',
        jsonb_build_object(
          'mensagem_preview', left(coalesce(NEW.message_text, ''), 140),
          'sigzap_message_id', NEW.id
        )
      );
    END IF;
  ELSE
    IF NEW.sent_by_user_id IS NOT NULL
       AND v_travada = false
       AND v_status IN ('Acompanhamento', 'sem_resposta') THEN
      UPDATE public.leads
         SET status = 'em_conversa',
             updated_at = now()
       WHERE id = v_lead_id;

      PERFORM public.fn_log_status_change(
        v_lead_id,
        v_status,
        'em_conversa',
        'operador',
        'Operador enviou mensagem manual — lead movido para Conversação',
        jsonb_build_object(
          'sent_by_user_id', NEW.sent_by_user_id,
          'mensagem_preview', left(coalesce(NEW.message_text, ''), 140)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_campaign_lead_on_inbound_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_chip_id uuid;
  v_provider text;
  v_external_ref text;
  v_message_at timestamptz := coalesce(NEW.sent_at, now());
BEGIN

  -- importação do histórico do celular (importar_historico_chakra): mensagem antiga não mexe em lead nem campanha
  IF current_setting('app.importando_historico', true) = '1' THEN RETURN NEW; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.trg_sigzap_outbound_marca_contactado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id UUID;
  v_conv_id UUID;
  v_already_outbound BOOLEAN;
  v_cp RECORD;
BEGIN

  -- importação do histórico do celular (importar_historico_chakra): mensagem antiga não mexe em lead nem campanha
  IF current_setting('app.importando_historico', true) = '1' THEN RETURN NEW; END IF;
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
$function$;

-- Importa um evento "history" da Chakra (histórico do celular que a Meta manda ao conectar o número
-- em coexistência) para a caixa de entrada. Até 03/11 esses eventos ficavam só guardados: no 93618-3444
-- eram 3.879 mensagens, e as nossas enviadas pelo celular não apareciam em lugar nenhum.
-- Não passa pelo receive: mensagem antiga de médico acionaria a IA e mudaria lead e campanha.
-- Idempotente (on conflict); pode rodar de novo no mesmo evento.
create or replace function public.importar_historico_chakra(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ev record; v_inst uuid; h jsonb; t jsonb; m jsonb;
  v_wa text; v_jid text; v_var text[]; v_contact uuid; v_conv uuid;
  v_from_me boolean; v_tipo text; v_orig text; v_texto text; v_midia jsonb; v_ts bigint; v_sent timestamptz;
  v_status text; v_n int; v_ins int := 0; v_dup int := 0; v_ign int := 0; v_threads int := 0;
  v_last_at timestamptz; v_last_txt text;
begin
  select id, phone_number_id, payload into ev from whatsapp_chakra_webhook_events
   where id = p_event_id and event_type = 'history';
  if not found then return jsonb_build_object('ok', false, 'erro', 'evento_nao_encontrado'); end if;
  select id into v_inst from sigzap_instances
   where provider = 'chakra' and external_ref = 'chakra:' || ev.phone_number_id limit 1;
  if v_inst is null then return jsonb_build_object('ok', false, 'erro', 'instancia_nao_encontrada'); end if;

  perform set_config('app.importando_historico', '1', true);

  for h in select * from jsonb_array_elements(coalesce(ev.payload #> '{item,history}', ev.payload -> 'history', '[]'::jsonb)) loop
    for t in select * from jsonb_array_elements(coalesce(h -> 'threads', '[]'::jsonb)) loop
      v_wa := regexp_replace(coalesce(t #>> '{context,wa_id}', t ->> 'id', ''), '\D', '', 'g');
      if v_wa = '' or jsonb_array_length(coalesce(t -> 'messages', '[]'::jsonb)) = 0 then continue; end if;
      v_threads := v_threads + 1;
      v_jid := v_wa || '@s.whatsapp.net';
      -- mesmo contato com e sem o nono dígito (JID brasileiro legado), como no receive
      v_var := array[v_wa, '+' || v_wa];
      if v_wa like '55%' and length(v_wa) = 12 then
        v_var := v_var || array[left(v_wa, 4) || '9' || substr(v_wa, 5), '+' || left(v_wa, 4) || '9' || substr(v_wa, 5)];
      elsif v_wa like '55%' and length(v_wa) = 13 and substr(v_wa, 5, 1) = '9' then
        v_var := v_var || array[left(v_wa, 4) || substr(v_wa, 6), '+' || left(v_wa, 4) || substr(v_wa, 6)];
      end if;
      v_contact := null;
      select id into v_contact from sigzap_contacts
       where instance_id = v_inst and (contact_jid = v_jid or contact_phone = any(v_var))
       order by (contact_jid = v_jid) desc limit 1;
      if v_contact is null then
        insert into sigzap_contacts (contact_jid, contact_phone, contact_name, instance_id)
        values (v_jid, v_wa, v_wa, v_inst) on conflict (contact_jid, instance_id) do nothing;
        select id into v_contact from sigzap_contacts where contact_jid = v_jid and instance_id = v_inst;
      end if;
      v_conv := null;
      select id into v_conv from sigzap_conversations where contact_id = v_contact and instance_id = v_inst;
      if v_conv is null then
        insert into sigzap_conversations (contact_id, instance_id, unread_count, status)
        values (v_contact, v_inst, 0, 'open') on conflict (contact_id, instance_id) do nothing;
        select id into v_conv from sigzap_conversations where contact_id = v_contact and instance_id = v_inst;
      end if;

      v_last_at := null; v_last_txt := null;
      for m in select * from jsonb_array_elements(t -> 'messages') loop
        v_orig := lower(coalesce(m ->> 'type', 'text'));
        v_tipo := v_orig;
        if v_tipo in ('reaction', 'edit', 'revoke', 'system', 'ephemeral') or coalesce(m ->> 'id', '') = '' then
          v_ign := v_ign + 1; continue;
        end if;
        v_from_me := coalesce((m #>> '{history_context,from_me}')::boolean, false);
        v_ts := nullif(regexp_replace(coalesce(m ->> 'timestamp', ''), '\D', '', 'g'), '')::bigint;
        if v_ts is null then v_ign := v_ign + 1; continue; end if;
        if v_ts > 100000000000 then v_ts := v_ts / 1000; end if; -- alguns vêm em milissegundos
        v_sent := to_timestamp(v_ts);
        v_midia := null;
        if v_tipo in ('image', 'video', 'audio', 'document', 'sticker') then
          v_texto := nullif(coalesce(m -> v_tipo ->> 'caption', ''), '');
          -- mesmo formato do receive: o recuperador de mídia lê data.message.<tipo>Message.id
          v_midia := jsonb_build_object(v_tipo || 'Message', jsonb_strip_nulls(jsonb_build_object(
            'id', m -> v_tipo ->> 'id', 'mimetype', m -> v_tipo ->> 'mime_type',
            'caption', m -> v_tipo ->> 'caption', 'fileName', m -> v_tipo ->> 'filename')));
        elsif v_tipo = 'text' then
          v_texto := m #>> '{text,body}';
        elsif v_tipo = 'location' then
          v_texto := '[Localização]'; v_tipo := 'text';
        elsif v_tipo = 'contacts' then
          v_texto := '[Contato compartilhado]'; v_tipo := 'text';
        else
          v_texto := coalesce(m #>> '{text,body}', m #>> '{button,text}', m #>> '{interactive,button_reply,title}', '[Mensagem ' || v_tipo || ']');
          v_tipo := 'text';
        end if;
        v_status := case when v_from_me then coalesce(nullif(m #>> '{history_context,status}', ''), 'delivered') else 'received' end;

        insert into sigzap_messages (conversation_id, wa_message_id, provider, provider_message_id, from_me, sender_jid,
          message_text, message_type, message_status, raw_payload, media_mime_type, media_caption, media_filename, sent_at)
        values (v_conv, m ->> 'id', 'chakra', m ->> 'id', v_from_me, case when v_from_me then null else v_jid end,
          v_texto, v_tipo, v_status,
          jsonb_build_object('historico', true, 'provider', 'chakra', 'item', m,
            'data', jsonb_build_object('key', jsonb_build_object('id', m ->> 'id', 'fromMe', v_from_me, 'remoteJid', v_jid),
              'messageType', v_tipo, 'message', coalesce(v_midia, '{}'::jsonb))),
          m -> v_orig ->> 'mime_type', m -> v_orig ->> 'caption', m -> v_orig ->> 'filename', v_sent)
        on conflict do nothing;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_ins := v_ins + 1; else v_dup := v_dup + 1; end if;
        if v_last_at is null or v_sent > v_last_at then
          v_last_at := v_sent;
          v_last_txt := coalesce(v_texto, '[' || v_tipo || ']');
        end if;
      end loop;

      -- só avança a última mensagem da conversa; nunca volta para trás
      if v_last_at is not null then
        update sigzap_conversations set last_message_at = v_last_at, last_message_text = left(v_last_txt, 500)
         where id = v_conv and (last_message_at is null or last_message_at < v_last_at);
      end if;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'conversas', v_threads, 'inseridas', v_ins, 'ja_existiam', v_dup, 'ignoradas', v_ign);
end $$;

revoke all on function public.importar_historico_chakra(uuid) from public, anon, authenticated;
grant execute on function public.importar_historico_chakra(uuid) to service_role;
