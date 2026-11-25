-- Texto do que a Zenvia enviou em Conversas (25/11/2026). O MESSAGE_STATUS não traz texto, e as mensagens enviadas
-- pela Zenvia no meio de uma conversa são, na maior parte, a equipe respondendo pela caixa da própria Zenvia (não
-- disparo de campanha). A partir de agora a Zenvia manda também MESSAGE com direction OUT (assinatura criada pelo
-- zenvia-api, ação assinar_saida), com o texto. Antes de 25/11 não há texto: fica "[Mensagem enviada pela Zenvia]".

-- Rótulo neutro: não dá para saber se foi disparo ou resposta da equipe.
update public.sigzap_messages set message_text = '[Mensagem enviada pela Zenvia]'
 where provider = 'zenvia' and from_me and message_text = '[Disparo da campanha Zenvia]';
update public.sigzap_conversations c set last_message_text = '[Mensagem enviada pela Zenvia]'
  from public.sigzap_instances i
 where i.id = c.instance_id and i.provider = 'zenvia' and c.last_message_text = '[Disparo da campanha Zenvia]';

-- Texto do envio, se o MESSAGE OUT dele já chegou.
create or replace function public.zenvia_texto_enviado(p_message_id text)
returns text language sql stable security definer set search_path = public as $$
  select texto from zenvia_eventos where tipo = 'MESSAGE' and direcao = 'OUT' and message_id = p_message_id
     and texto is not null order by evento_em limit 1;
$$;

create or replace function public.zenvia_gravar_disparo(p_conv uuid, p_message_id text, p_telefone text)
returns void language plpgsql security definer set search_path = public as $$
declare v_primeiro timestamptz; v_status text;
begin
  select min(evento_em) into v_primeiro from zenvia_eventos
   where message_id = p_message_id and (tipo = 'MESSAGE_STATUS' or (tipo = 'MESSAGE' and direcao = 'OUT'));
  -- o status mais adiantado que já chegou para este envio
  select s into v_status from (
    select zenvia_status_sigzap(status) s from zenvia_eventos where tipo = 'MESSAGE_STATUS' and message_id = p_message_id
  ) x order by zenvia_status_ordem(s) desc limit 1;
  insert into sigzap_messages (conversation_id, wa_message_id, provider, provider_message_id, from_me, message_text,
    message_type, message_status, raw_payload, sent_at)
  values (p_conv, p_message_id, 'zenvia', p_message_id, true,
    coalesce(zenvia_texto_enviado(p_message_id), '[Mensagem enviada pela Zenvia]'), 'text',
    coalesce(v_status, 'sent'), jsonb_build_object('provider', 'zenvia', 'telefone', p_telefone),
    coalesce(v_primeiro, now()))
  on conflict do nothing;
end $$;

create or replace function public.zenvia_espelhar_evento(p_id bigint, p_ao_vivo boolean default true)
returns text language plpgsql security definer set search_path = public as $$
declare e record; v_conv uuid; v_nome text; v_n int; v_status text; v_msg uuid; d record; v_texto text;
begin
  select * into e from zenvia_eventos where id = p_id;
  if not found or e.telefone_norm is null then return 'ignorado'; end if;
  perform set_config('app.importando_historico', '1', true);

  if e.tipo = 'MESSAGE' and e.direcao = 'IN' then
    v_nome := nullif(trim(coalesce(e.payload #>> '{message,visitor,name}',
      concat_ws(' ', e.payload #>> '{message,visitor,firstName}', e.payload #>> '{message,visitor,lastName}'))), '');
    v_conv := zenvia_conversa(e.destinatario, e.telefone_norm, v_nome, true);
    if v_conv is null then return 'sem_conversa'; end if;
    -- o gatilho de lead da conversa procura pelo telefone; a Zenvia já achou o lead (fn_zenvia_evento_lead)
    if e.lead_id is not null then
      update sigzap_conversations set lead_id = e.lead_id where id = v_conv and lead_id is null;
    end if;
    -- sem texto: arquivo (file), contato compartilhado (contacts) ou tipo que a Zenvia não lê (unsupported)
    v_texto := coalesce(e.texto, case e.payload #>> '{message,contents,0,type}'
      when 'file' then '[Arquivo enviado pelo médico: veja na Zenvia]'
      when 'contacts' then '[Contato compartilhado]'
      else '[Mensagem sem texto]' end);
    -- envios anteriores para este telefone (a conversa pode estar nascendo agora)
    for d in select distinct message_id from zenvia_eventos
              where telefone_norm = e.telefone_norm and remetente = e.destinatario and message_id is not null
                and evento_em <= e.evento_em
                and (tipo = 'MESSAGE_STATUS' or (tipo = 'MESSAGE' and direcao = 'OUT')) loop
      perform zenvia_gravar_disparo(v_conv, d.message_id, e.telefone_norm);
    end loop;
    insert into sigzap_messages (conversation_id, wa_message_id, provider, provider_message_id, from_me, sender_jid,
      message_text, message_type, message_status, raw_payload, sent_at)
    values (v_conv, coalesce(e.message_id, e.evento_id, e.id::text), 'zenvia', coalesce(e.message_id, e.evento_id, e.id::text),
      false, e.telefone_norm || '@s.whatsapp.net', v_texto, 'text', 'received',
      jsonb_build_object('provider', 'zenvia', 'evento', e.payload), e.evento_em)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then return 'ja_existia'; end if;
    update sigzap_conversations
       set last_message_at = greatest(coalesce(last_message_at, e.evento_em), e.evento_em),
           last_message_text = case when last_message_at is null or last_message_at <= e.evento_em
                                    then left(v_texto, 500) else last_message_text end,
           service_window_expires_at = greatest(coalesce(service_window_expires_at, e.evento_em), e.evento_em + interval '24 hours'),
           unread_count = unread_count + case when p_ao_vivo then 1 else 0 end
     where id = v_conv;
    return 'resposta';
  end if;

  if e.tipo = 'MESSAGE' and e.direcao = 'OUT' and e.message_id is not null then
    -- envio já gravado (pelo status ou pelo Sigma): só põe o texto no lugar do rótulo
    update sigzap_messages set message_text = coalesce(e.texto, message_text)
     where provider = 'zenvia' and provider_message_id = e.message_id and message_text = '[Mensagem enviada pela Zenvia]'
    returning id, conversation_id into v_msg, v_conv;
    if v_msg is null then
      if exists (select 1 from sigzap_messages where provider = 'zenvia' and provider_message_id = e.message_id) then
        return 'texto_igual';
      end if;
      v_conv := zenvia_conversa(e.remetente, e.telefone_norm, null, false);
      if v_conv is null then return 'sem_conversa'; end if;
      perform zenvia_gravar_disparo(v_conv, e.message_id, e.telefone_norm);
    end if;
    update sigzap_conversations set last_message_at = e.evento_em,
           last_message_text = left(coalesce(e.texto, '[Mensagem enviada pela Zenvia]'), 500)
     where id = v_conv and (last_message_at is null or last_message_at <= e.evento_em);
    return 'enviada';
  end if;

  if e.tipo = 'MESSAGE_STATUS' and e.message_id is not null then
    v_status := zenvia_status_sigzap(e.status);
    -- mensagem que a equipe mandou pelo Sigma (ou envio já gravado): só avança o status
    update sigzap_messages set message_status = v_status
     where provider = 'zenvia' and provider_message_id = e.message_id
       and zenvia_status_ordem(v_status) > zenvia_status_ordem(message_status)
    returning id into v_msg;
    if v_msg is not null then return 'status'; end if;
    if exists (select 1 from sigzap_messages where provider = 'zenvia' and provider_message_id = e.message_id) then
      return 'status_igual';
    end if;
    -- envio novo para quem já tem conversa: entra na conversa
    v_conv := zenvia_conversa(e.remetente, e.telefone_norm, null, false);
    if v_conv is null then return 'sem_conversa'; end if;
    perform zenvia_gravar_disparo(v_conv, e.message_id, e.telefone_norm);
    update sigzap_conversations
       set last_message_at = e.evento_em,
           last_message_text = left(coalesce(zenvia_texto_enviado(e.message_id), '[Mensagem enviada pela Zenvia]'), 500)
     where id = v_conv and (last_message_at is null or last_message_at < e.evento_em);
    return 'disparo';
  end if;
  return 'ignorado';
end $$;

revoke all on function public.zenvia_texto_enviado(text) from public, anon, authenticated;
grant execute on function public.zenvia_texto_enviado(text) to service_role;
