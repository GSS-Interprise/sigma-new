-- 04/11: pula 'errors' e dá nome ao 'media_placeholder' (antes viravam "[Mensagem errors]").
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

revoke all on function public.importar_historico_chakra(uuid) from public, anon, authenticated;
grant execute on function public.importar_historico_chakra(uuid) to service_role;

-- Limpeza das mensagens dos números oficiais (Chakra) gravadas errado até 04/11. Tudo que é apagado
-- vai antes para sigzap_messages_limpeza_20261104 (cópia da linha + motivo).
--   1. Reação, edição e "apagar para todos" do contato viravam "[Mensagem sem conteúdo]": a reação vai
--      para a mensagem reagida, a edição troca o texto da original, a apagada marca a original; a linha
--      falsa sai. Contavam como resposta do médico nos indicadores.
--   2. Contato compartilhado vira mensagem de contato com nome e telefone.
--   3. "[Mensagem errors]"/errors (mensagem que o celular não exportou) sai; media_placeholder ganha nome.
--   4. "[object Object]": texto do eco da API recuperado do evento; cópia de mensagem já gravada sai.
--   5. Texto cortado em 240 caracteres volta inteiro a partir do evento guardado.
create table if not exists public.sigzap_messages_limpeza_20261104
  (like public.sigzap_messages, motivo text, limpo_em timestamptz default now());
alter table public.sigzap_messages_limpeza_20261104 enable row level security;
revoke all on public.sigzap_messages_limpeza_20261104 from public, anon, authenticated;
grant all on public.sigzap_messages_limpeza_20261104 to service_role;

create temp table ev_item on commit drop as
select distinct on (wid) wid, item from (
  select coalesce(payload #>> '{item,id}', payload #>> '{message,id}') wid,
         coalesce(payload -> 'item', payload -> 'message') item, received_at
  from public.whatsapp_chakra_webhook_events
  where event_type in ('messages', 'message', 'smb_message_echo', 'message_echo')
) s where wid is not null and item ? 'type' -- evento de status usa o mesmo id e não tem conteúdo
order by wid, received_at;
create index on ev_item (wid);

create temp table lixo on commit drop as
select m.id, m.conversation_id, e.item,
       coalesce(e.item ->> 'type', m.raw_payload #>> '{data,messageType}') tipo
from public.sigzap_messages m left join ev_item e on e.wid = m.wa_message_id
where m.provider = 'chakra' and m.message_text = '[Mensagem sem conteúdo]';

-- 1. reação: a mais recente de cada mensagem reagida
update public.sigzap_messages t set reaction = r.emoji
from (select distinct on (item #>> '{reaction,message_id}') item #>> '{reaction,message_id}' alvo,
             nullif(item #>> '{reaction,emoji}', '') emoji
      from lixo where tipo = 'reaction' and item is not null
      order by item #>> '{reaction,message_id}', (item ->> 'timestamp')::bigint desc) r
where t.wa_message_id = r.alvo;

update public.sigzap_messages t set message_text = r.novo
from (select distinct on (item #>> '{edit,original_message_id}') item #>> '{edit,original_message_id}' alvo,
             coalesce(item #>> '{edit,message,text,body}',
                      item -> 'edit' -> 'message' -> (item #>> '{edit,message,type}') ->> 'caption') novo
      from lixo where tipo = 'edit' and item is not null
      order by item #>> '{edit,original_message_id}', (item ->> 'timestamp')::bigint desc) r
where t.wa_message_id = r.alvo and r.novo is not null;

update public.sigzap_messages t set message_text = '[Mensagem apagada]'
from lixo l where l.tipo = 'revoke' and t.wa_message_id = l.item #>> '{revoke,original_message_id}';

-- 2. contato compartilhado
update public.sigzap_messages m set
  message_type = 'contact',
  message_text = '[Contato: ' || coalesce(nullif(l.item #>> '{contacts,0,name,formatted_name}', ''), 'sem nome') || ']',
  contact_data = case when l.item is null then null else jsonb_build_object(
    'displayName', l.item #>> '{contacts,0,name,formatted_name}',
    'phone', coalesce(l.item #>> '{contacts,0,phones,0,wa_id}', l.item #>> '{contacts,0,phones,0,phone}'),
    'vcard', convert_from(decode(coalesce(l.item #>> '{contacts,0,vcard}', ''), 'base64'), 'UTF8')) end
from lixo l where m.id = l.id and l.tipo = 'contacts';

-- 3. media_placeholder (receive de 26-29/10 e importador)
update public.sigzap_messages m set message_text = '[Arquivo do histórico indisponível]'
where m.provider = 'chakra' and (m.message_text = '[Mensagem media_placeholder]'
  or (m.message_text = '[Mensagem sem conteúdo]' and m.raw_payload #>> '{data,messageType}' = 'media_placeholder'));

-- 4. [object Object]: texto do eco; se a mesma mensagem já existe na conversa (gravada pelo envio), sai
create temp table obj on commit drop as
select m.id, m.conversation_id, m.sent_at, e.item #>> '{text,text,body}' texto
from public.sigzap_messages m join ev_item e on e.wid = m.wa_message_id
where m.provider = 'chakra' and m.message_text = '[object Object]' and e.item #>> '{text,text,body}' is not null;

create temp table apagar on commit drop as
select id, 'reacao_edicao_apagada_erro' motivo from lixo where tipo in ('reaction', 'edit', 'revoke', 'errors')
union all
select id, 'historico_errors' from public.sigzap_messages where provider = 'chakra' and message_text = '[Mensagem errors]'
union all
select o.id, 'eco_api_duplicado' from obj o where exists (
  select 1 from public.sigzap_messages d where d.conversation_id = o.conversation_id and d.id <> o.id and d.from_me
    and d.message_text = o.texto and abs(extract(epoch from d.sent_at - o.sent_at)) < 600);

update public.sigzap_messages m set message_text = o.texto
from obj o where m.id = o.id and not exists (select 1 from apagar a where a.id = o.id);

-- 5. texto cortado em 240
update public.sigzap_messages m set message_text = coalesce(e.item #>> '{text,body}', e.item #>> '{text,text,body}')
from ev_item e
where m.provider = 'chakra' and e.wid = m.wa_message_id and length(m.message_text) = 240
  and length(coalesce(e.item #>> '{text,body}', e.item #>> '{text,text,body}', '')) > 240
  and left(coalesce(e.item #>> '{text,body}', e.item #>> '{text,text,body}'), 240) = m.message_text;

insert into public.sigzap_messages_limpeza_20261104
select m.*, a.motivo, now() from public.sigzap_messages m join apagar a on a.id = m.id
on conflict do nothing;
delete from public.sigzap_messages m using apagar a where a.id = m.id;

-- prévia da conversa: volta para a última mensagem que sobrou
update public.sigzap_conversations c set last_message_text = left(u.message_text, 500)
from (select distinct on (conversation_id) conversation_id, message_text from public.sigzap_messages
      where conversation_id in (select conversation_id from public.sigzap_messages_limpeza_20261104)
      order by conversation_id, sent_at desc) u
where c.id = u.conversation_id
  and (c.last_message_text in ('[Mensagem sem conteúdo]', '[Mensagem errors]', '[object Object]', '[Mensagem media_placeholder]')
       or c.last_message_text is null);
