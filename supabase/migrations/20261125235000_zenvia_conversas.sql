-- Conversas da Zenvia dentro do Sigma (25/11/2026). Até aqui o zenvia-webhook só alimentava o BI (zenvia_eventos): a
-- resposta do médico a um disparo da Zenvia não aparecia em Conversas e ninguém via que ele respondeu.
--
-- Regra:
--   - O número da Zenvia vira uma instância do SigZap (provider 'zenvia', external_ref 'zenvia:<número>').
--   - A conversa nasce quando o médico RESPONDE. Disparo sem resposta não abre conversa (seriam milhares de conversas
--     só com o nosso disparo). Quando ela nasce, os disparos anteriores para aquele telefone entram junto.
--   - A Zenvia não devolve o texto do que ela enviou (o evento de status só tem o id): o disparo aparece como
--     "[Disparo da campanha Zenvia]". O que a equipe responde pelo Sigma (whatsapp-oficial-send) sai com o texto.
--   - Espelhar não mexe em lead nem campanha (app.importando_historico): o histórico do lead já é gravado pelos
--     gatilhos da própria zenvia_eventos (20261118170000_zenvia_historico_lead.sql).
--   - O tempo de resposta (atendimento_*) continua só com os números da Chakra: este é um passo à parte.

drop function if exists public.zenvia_espelhar_evento(uuid, boolean);
alter table public.sigzap_instances drop constraint if exists sigzap_instances_provider_check;
alter table public.sigzap_instances add constraint sigzap_instances_provider_check
  check (provider = any (array['evolution', 'twilio', 'chakra', 'zenvia']));
alter table public.sigzap_messages drop constraint if exists sigzap_messages_provider_check;
alter table public.sigzap_messages add constraint sigzap_messages_provider_check
  check (provider = any (array['evolution', 'twilio', 'chakra', 'zenvia']));

-- Status da Zenvia no vocabulário do SigZap. Ordem para nunca voltar (lido não volta para entregue).
create or replace function public.zenvia_status_sigzap(p_code text)
returns text language sql immutable as $$
  select case upper(coalesce(p_code, ''))
    when 'SENT' then 'sent' when 'DELIVERED' then 'delivered' when 'READ' then 'read'
    when 'REJECTED' then 'failed' when 'NOT_DELIVERED' then 'failed' else 'sent' end;
$$;

create or replace function public.zenvia_status_ordem(p_status text)
returns int language sql immutable as $$
  select case p_status when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3
    when 'failed' then 4 else 0 end;
$$;

-- Instância, contato e conversa do telefone. Sem p_criar, só devolve a conversa se ela já existir.
create or replace function public.zenvia_conversa(p_numero text, p_telefone text, p_nome text default null, p_criar boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inst uuid; v_jid text; v_contact uuid; v_conv uuid;
begin
  if coalesce(p_numero, '') = '' or coalesce(p_telefone, '') = '' then return null; end if;
  select id into v_inst from sigzap_instances where provider = 'zenvia' and external_ref = 'zenvia:' || p_numero;
  if v_inst is null then
    if not p_criar then return null; end if;
    insert into sigzap_instances (name, phone_number, profile_name, status, provider, external_ref)
    values ('Zenvia ' || p_numero, p_numero, 'Zenvia', 'connected', 'zenvia', 'zenvia:' || p_numero)
    on conflict (name) do nothing;
    select id into v_inst from sigzap_instances where provider = 'zenvia' and external_ref = 'zenvia:' || p_numero;
  end if;
  v_jid := p_telefone || '@s.whatsapp.net';
  select id into v_contact from sigzap_contacts where instance_id = v_inst and contact_jid = v_jid;
  if v_contact is null then
    if not p_criar then return null; end if;
    insert into sigzap_contacts (contact_jid, contact_phone, contact_name, instance_id)
    values (v_jid, p_telefone, coalesce(nullif(trim(p_nome), ''), p_telefone), v_inst)
    on conflict (contact_jid, instance_id) do nothing;
    select id into v_contact from sigzap_contacts where instance_id = v_inst and contact_jid = v_jid;
  end if;
  select id into v_conv from sigzap_conversations where contact_id = v_contact and instance_id = v_inst;
  if v_conv is null and p_criar then
    insert into sigzap_conversations (contact_id, instance_id, unread_count, status)
    values (v_contact, v_inst, 0, 'open') on conflict (contact_id, instance_id) do nothing;
    select id into v_conv from sigzap_conversations where contact_id = v_contact and instance_id = v_inst;
  end if;
  return v_conv;
end $$;

-- Grava (ou atualiza o status de) um disparo da Zenvia numa conversa que já existe.
create or replace function public.zenvia_gravar_disparo(p_conv uuid, p_message_id text, p_telefone text)
returns void language plpgsql security definer set search_path = public as $$
declare v_primeiro timestamptz; v_status text;
begin
  select min(evento_em) into v_primeiro from zenvia_eventos where tipo = 'MESSAGE_STATUS' and message_id = p_message_id;
  -- o status mais adiantado que já chegou para este disparo
  select s into v_status from (
    select zenvia_status_sigzap(status) s from zenvia_eventos where tipo = 'MESSAGE_STATUS' and message_id = p_message_id
  ) x order by zenvia_status_ordem(s) desc limit 1;
  insert into sigzap_messages (conversation_id, wa_message_id, provider, provider_message_id, from_me, message_text,
    message_type, message_status, raw_payload, sent_at)
  values (p_conv, p_message_id, 'zenvia', p_message_id, true, '[Disparo da campanha Zenvia]', 'text',
    coalesce(v_status, 'sent'), jsonb_build_object('provider', 'zenvia', 'disparo', true, 'telefone', p_telefone),
    coalesce(v_primeiro, now()))
  on conflict do nothing;
end $$;

-- Espelha um evento da zenvia_eventos em Conversas. p_ao_vivo: soma não lida (o backfill não soma).
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
    -- disparos anteriores para este telefone (a conversa pode estar nascendo agora)
    for d in select distinct message_id from zenvia_eventos
              where tipo = 'MESSAGE_STATUS' and telefone_norm = e.telefone_norm and remetente = e.destinatario
                and message_id is not null and evento_em <= e.evento_em loop
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

  if e.tipo = 'MESSAGE_STATUS' and e.message_id is not null then
    v_status := zenvia_status_sigzap(e.status);
    -- mensagem que a equipe mandou pelo Sigma (ou disparo já gravado): só avança o status
    update sigzap_messages set message_status = v_status
     where provider = 'zenvia' and provider_message_id = e.message_id
       and zenvia_status_ordem(v_status) > zenvia_status_ordem(message_status)
    returning id into v_msg;
    if v_msg is not null then return 'status'; end if;
    if exists (select 1 from sigzap_messages where provider = 'zenvia' and provider_message_id = e.message_id) then
      return 'status_igual';
    end if;
    -- disparo novo para quem já tem conversa: entra na conversa
    v_conv := zenvia_conversa(e.remetente, e.telefone_norm, null, false);
    if v_conv is null then return 'sem_conversa'; end if;
    perform zenvia_gravar_disparo(v_conv, e.message_id, e.telefone_norm);
    update sigzap_conversations set last_message_at = e.evento_em, last_message_text = '[Disparo da campanha Zenvia]'
     where id = v_conv and (last_message_at is null or last_message_at < e.evento_em);
    return 'disparo';
  end if;
  return 'ignorado';
end $$;

-- Ao vivo: cada evento novo é espelhado. Erro aqui nunca derruba o webhook (a Zenvia desliga assinatura com erro).
create or replace function public.fn_zenvia_evento_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.zenvia_espelhar_evento(new.id, true);
  exception when others then
    raise warning '[zenvia_conversa] evento %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists trg_zenvia_evento_conversa on public.zenvia_eventos;
create trigger trg_zenvia_evento_conversa after insert on public.zenvia_eventos
  for each row execute function public.fn_zenvia_evento_conversa();

-- Conversas mostra os números da Zenvia junto com os da Chakra.
create or replace function public.conversas_numeros()
returns table (
  instance_id uuid,
  phone_e164 text,
  display_name text,
  uso text,
  disponibilidade text,
  responsavel_nome text,
  nao_lidas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    i.phone_number,
    case when i.provider = 'zenvia' then 'Zenvia' else coalesce(c.display_name, i.profile_name, i.name) end,
    coalesce(c.uso, 'prospeccao'),
    c.disponibilidade,
    p.nome_completo,
    coalesce((select sum(sc.unread_count) from sigzap_conversations sc where sc.instance_id = i.id and sc.unread_count > 0), 0)
  from sigzap_instances i
  left join whatsapp_chakra_connections c on i.provider = 'chakra' and c.phone_e164 = i.phone_number
  left join profiles p on p.id = c.responsavel_id
  where i.provider in ('chakra', 'zenvia')
    and coalesce(i.status, '') <> 'deleted'
    and auth.uid() is not null
  order by coalesce(c.uso, 'prospeccao') = 'financeiro', i.provider = 'zenvia', i.phone_number;
$$;
revoke all on function public.conversas_numeros() from public, anon;
grant execute on function public.conversas_numeros() to authenticated, service_role;

revoke all on function public.zenvia_conversa(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.zenvia_gravar_disparo(uuid, text, text) from public, anon, authenticated;
revoke all on function public.zenvia_espelhar_evento(bigint, boolean) from public, anon, authenticated;
grant execute on function public.zenvia_conversa(text, text, text, boolean) to service_role;
grant execute on function public.zenvia_gravar_disparo(uuid, text, text) to service_role;
grant execute on function public.zenvia_espelhar_evento(bigint, boolean) to service_role;

-- Backfill: todas as respostas já recebidas, em ordem, sem somar não lida.
do $$
declare r record;
begin
  for r in select id from public.zenvia_eventos where tipo = 'MESSAGE' and direcao = 'IN' order by evento_em loop
    perform public.zenvia_espelhar_evento(r.id, false);
  end loop;
end $$;

-- Respostas sem texto gravadas antes do rótulo por tipo (arquivo, contato compartilhado).
update public.sigzap_messages m
   set message_text = case e.payload #>> '{message,contents,0,type}'
         when 'file' then '[Arquivo enviado pelo médico: veja na Zenvia]'
         when 'contacts' then '[Contato compartilhado]' else m.message_text end
  from public.zenvia_eventos e
 where m.provider = 'zenvia' and not m.from_me and m.message_text = '[Mensagem sem texto]'
   and e.tipo = 'MESSAGE' and e.message_id = m.provider_message_id;
update public.sigzap_conversations c
   set last_message_text = m.message_text
  from public.sigzap_messages m
 where m.conversation_id = c.id and m.provider = 'zenvia' and c.last_message_text = '[Mensagem sem texto]'
   and m.sent_at = c.last_message_at;
