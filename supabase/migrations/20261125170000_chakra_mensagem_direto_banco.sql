-- Backlog do webhook da Chakra direto no banco (25/11/2026). Doc: docs/arquitetura/chakra-webhook-fila.md.
-- O worker da fila gravava mensagem antiga chamando o receive-whatsapp-messages por HTTP, e a chamada de função para
-- função tem limite ("Rate limit exceeded for function"): com ~59 mil eventos de backlog, até mensagem ao vivo
-- ficava parada. Agora mensagem antiga (modo histórico) vai pela mesma regra do importador de histórico do celular,
-- em SQL, idempotente (on conflict do nothing no índice (conversation_id, wa_message_id)), sem IA e sem campanha.
--
-- 1) O corpo do importador de histórico passa a receber o payload (antes lia só eventos 'history').
create or replace function public.importar_historico_chakra_payload(p_phone_number_id text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid; h jsonb; t jsonb; m jsonb;
  v_wa text; v_jid text; v_var text[]; v_contact uuid; v_conv uuid;
  v_from_me boolean; v_tipo text; v_orig text; v_texto text; v_midia jsonb; v_ts bigint; v_sent timestamptz;
  v_status text; v_n int; v_ins int := 0; v_dup int := 0; v_ign int := 0; v_threads int := 0;
  v_last_at timestamptz; v_last_txt text;
begin
  select id into v_inst from sigzap_instances
   where provider = 'chakra' and external_ref = 'chakra:' || p_phone_number_id limit 1;
  if v_inst is null then return jsonb_build_object('ok', false, 'erro', 'instancia_nao_encontrada'); end if;

  perform set_config('app.importando_historico', '1', true);

  for h in select * from jsonb_array_elements(coalesce(p_payload #> '{item,history}', p_payload -> 'history', '[]'::jsonb)) loop
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
        -- errors: mensagem que o celular não conseguiu exportar (Meta 131051), não tem conteúdo nenhum
        if v_tipo in ('reaction', 'edit', 'revoke', 'system', 'ephemeral', 'errors') or coalesce(m ->> 'id', '') = '' then
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
        elsif v_tipo = 'media_placeholder' then
          -- arquivo que o celular não mandou junto com o histórico
          v_texto := '[Arquivo do histórico indisponível]'; v_tipo := 'text';
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

create or replace function public.importar_historico_chakra(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev record;
begin
  select id, phone_number_id, payload into ev from whatsapp_chakra_webhook_events
   where id = p_event_id and event_type = 'history';
  if not found then return jsonb_build_object('ok', false, 'erro', 'evento_nao_encontrado'); end if;
  return public.importar_historico_chakra_payload(ev.phone_number_id, ev.payload);
end $$;

-- 2) Uma mensagem avulsa (message, messages, smb_message_echo, message_echo) vira uma "conversa de histórico" de uma
--    mensagem só e passa pelo mesmo importador. Eco do celular = enviada por nós (from_me), contato = "to".
create or replace function public.importar_mensagem_chakra(p_event_id uuid, p_phone_number_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev record; m jsonb; v_from_me boolean; v_wa text;
begin
  select id, event_type, phone_number_id, payload into ev from whatsapp_chakra_webhook_events where id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'evento_nao_encontrado'); end if;
  m := coalesce(ev.payload -> 'message', ev.payload -> 'item');
  if m is null or coalesce(m ->> 'id', '') = '' then return jsonb_build_object('ok', true, 'ignoradas', 1); end if;
  v_from_me := ev.event_type in ('smb_message_echo', 'message_echo');
  v_wa := case when v_from_me then m ->> 'to' else m ->> 'from' end;
  m := m || jsonb_build_object('history_context', coalesce(m -> 'history_context', '{}'::jsonb) || jsonb_build_object('from_me', v_from_me));
  return public.importar_historico_chakra_payload(coalesce(p_phone_number_id, ev.phone_number_id),
    jsonb_build_object('history', jsonb_build_array(jsonb_build_object('threads', jsonb_build_array(
      jsonb_build_object('context', jsonb_build_object('wa_id', v_wa), 'messages', jsonb_build_array(m)))))));
end $$;

revoke all on function public.importar_historico_chakra_payload(text, jsonb) from public, anon, authenticated;
revoke all on function public.importar_historico_chakra(uuid) from public, anon, authenticated;
revoke all on function public.importar_mensagem_chakra(uuid, text) from public, anon, authenticated;
grant execute on function public.importar_historico_chakra_payload(text, jsonb) to service_role;
grant execute on function public.importar_historico_chakra(uuid) to service_role;
grant execute on function public.importar_mensagem_chakra(uuid, text) to service_role;
