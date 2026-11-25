-- Fila da Chakra, parte 2 (25/11/2026). Doc: docs/arquitetura/chakra-webhook-fila.md.
-- Com coexistência, todo o WhatsApp dos números da equipe passa pelo webhook (~300 eventos/min). Mandar cada mensagem
-- ao receive-whatsapp-messages por HTTP bate no limite de chamada entre funções, e o worker em edge estourava recurso
-- (WORKER_RESOURCE_LIMIT) com pacotes de histórico. Agora:
--   * backlog e histórico são drenados 100% no banco (chakra_fila_drenar, cron a cada 30 s);
--   * mensagem ao vivo sem automação também é gravada pelo banco (importar_mensagem_chakra com p_ao_vivo), somando
--     não lida e abrindo a janela de 24 h; só vai ao receiver o que precisa de IA, botão ou descadastro.

-- 1) Mensagem avulsa; p_ao_vivo = conversa ganha não lida, reabre e abre a janela de 24 h (mensagem recebida).
create or replace function public.importar_mensagem_chakra(p_event_id uuid, p_phone_number_id text default null, p_ao_vivo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ev record; m jsonb; v_from_me boolean; v_wa text; v_res jsonb; v_inst uuid; v_nome text; v_sent timestamptz;
begin
  select id, event_type, phone_number_id, payload into ev from whatsapp_chakra_webhook_events where id = p_event_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'evento_nao_encontrado'); end if;
  m := coalesce(ev.payload -> 'message', ev.payload -> 'item');
  if m is null or coalesce(m ->> 'id', '') = '' then return jsonb_build_object('ok', true, 'ignoradas', 1); end if;
  v_from_me := ev.event_type in ('smb_message_echo', 'message_echo');
  v_wa := regexp_replace(coalesce(case when v_from_me then m ->> 'to' else m ->> 'from' end, ''), '\D', '', 'g');
  m := m || jsonb_build_object('history_context', coalesce(m -> 'history_context', '{}'::jsonb) || jsonb_build_object('from_me', v_from_me));
  v_res := public.importar_historico_chakra_payload(coalesce(p_phone_number_id, ev.phone_number_id),
    jsonb_build_object('history', jsonb_build_array(jsonb_build_object('threads', jsonb_build_array(
      jsonb_build_object('context', jsonb_build_object('wa_id', v_wa), 'messages', jsonb_build_array(m)))))));

  -- Nome do contato que o WhatsApp manda junto (só onde ainda está o número).
  v_nome := nullif(ev.payload #>> '{contacts,0,profile,name}', '');
  select id into v_inst from sigzap_instances where provider = 'chakra' and external_ref = 'chakra:' || coalesce(p_phone_number_id, ev.phone_number_id) limit 1;
  if v_nome is not null and v_inst is not null then
    update sigzap_contacts set contact_name = v_nome
     where instance_id = v_inst and contact_jid = v_wa || '@s.whatsapp.net' and (contact_name is null or contact_name = contact_phone);
  end if;

  if p_ao_vivo and not v_from_me and coalesce((v_res ->> 'inseridas')::int, 0) > 0 and v_inst is not null then
    v_sent := to_timestamp(nullif(regexp_replace(coalesce(m ->> 'timestamp', ''), '\D', '', 'g'), '')::bigint);
    update sigzap_conversations c set unread_count = coalesce(c.unread_count, 0) + 1, status = 'open',
           service_window_expires_at = greatest(coalesce(c.service_window_expires_at, v_sent), v_sent + interval '24 hours')
      from sigzap_contacts k
     where c.contact_id = k.id and k.instance_id = v_inst and c.instance_id = v_inst and k.contact_jid = v_wa || '@s.whatsapp.net';
  end if;
  return v_res;
end $$;
drop function if exists public.importar_mensagem_chakra(uuid, text);
revoke all on function public.importar_mensagem_chakra(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.importar_mensagem_chakra(uuid, text, boolean) to service_role;

-- 2) Drena backlog e histórico no banco. Pega só o que o SQL sabe gravar sozinho: mensagens (menos edição, apagada e
--    reação, que vão para o worker em edge) e pacotes 'history'. Respeita somente_leads. SKIP LOCKED: pode rodar junto
--    com o worker em edge sem pegar o mesmo evento.
create or replace function public.chakra_fila_drenar(p_limite int default 1000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_conn record; v_res jsonb; v_wa text; v_ok int := 0; v_ign int := 0; v_err int := 0; v_m jsonb;
begin
  for r in
    select e.* from whatsapp_chakra_webhook_events e
     where e.processing_status in ('received', 'retry') and e.proxima_tentativa_em <= now()
       and (e.prioridade >= 7 or e.received_at < now() - interval '10 minutes')
       and (e.event_type = 'history' or (e.event_type in ('message', 'messages', 'smb_message_echo', 'message_echo')
            and coalesce(e.payload #>> '{message,type}', e.payload #>> '{item,type}', '') not in ('edit', 'revoke', 'reaction')))
     order by e.prioridade, e.received_at
     limit p_limite
     for update skip locked
  loop
    begin
      select phone_number_id, somente_leads into v_conn from whatsapp_chakra_connections
       where phone_number_id = r.phone_number_id or (r.phone_number_id is null and waba_id = coalesce(r.waba_id, r.payload ->> 'wabaId'))
       limit 1;
      if not found then
        update whatsapp_chakra_webhook_events set processing_status = 'ignored', error_message = 'ignored_unmanaged_phone' where id = r.id;
        v_ign := v_ign + 1; continue;
      end if;
      if r.event_type = 'history' then
        v_res := public.importar_historico_chakra_payload(v_conn.phone_number_id, r.payload);
      else
        v_m := coalesce(r.payload -> 'message', r.payload -> 'item');
        v_wa := regexp_replace(coalesce(case when r.event_type in ('smb_message_echo', 'message_echo') then v_m ->> 'to' else v_m ->> 'from' end, ''), '\D', '', 'g');
        if v_conn.somente_leads and public.find_lead_by_phone('+' || v_wa) is null then
          update whatsapp_chakra_webhook_events set processing_status = 'ignored', error_message = 'ignored_not_a_lead',
                 payload = jsonb_build_object('descartado', 'contato_fora_da_base') where id = r.id;
          v_ign := v_ign + 1; continue;
        end if;
        v_res := public.importar_mensagem_chakra(r.id, v_conn.phone_number_id, false);
      end if;
      if coalesce((v_res ->> 'ok')::boolean, false) then
        update whatsapp_chakra_webhook_events set processing_status = 'processed', error_message = null,
               phone_number_id = coalesce(phone_number_id, v_conn.phone_number_id), reservado_em = null where id = r.id;
        v_ok := v_ok + 1;
      else
        perform public.chakra_fila_falhou(r.id, 'drenar:' || coalesce(v_res ->> 'erro', 'falhou'));
        v_err := v_err + 1;
      end if;
    exception when others then
      perform public.chakra_fila_falhou(r.id, 'drenar:' || sqlerrm);
      v_err := v_err + 1;
    end;
  end loop;
  return jsonb_build_object('gravados', v_ok, 'ignorados', v_ign, 'falhas', v_err);
end $$;
revoke all on function public.chakra_fila_drenar(int) from public, anon, authenticated;
grant execute on function public.chakra_fila_drenar(int) to service_role;

-- 3) Cron do dreno a cada 20 s (lote de 700; 200 eventos levaram ~4 s no teste de 25/11). Lote que estoura o
--    statement_timeout volta inteiro (nada se perde, só não avança): por isso o lote é pequeno.
select cron.unschedule('chakra-fila-drenar') where exists (select 1 from cron.job where jobname = 'chakra-fila-drenar');
select cron.schedule('chakra-fila-drenar', '20 seconds', $$ set statement_timeout = '18s'; select public.chakra_fila_drenar(700); $$);
