-- Funções de apoio da edge whatsapp-monitor (docs/arquitetura/monitor-numeros-whatsapp.md).

-- O número entregou alguma mensagem nossa nas últimas 48 h? Se sim, o teste real é desnecessário.
create or replace function public.whatsapp_monitor_entregou_48h(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from sigzap_instances i
      join sigzap_conversations sc on sc.instance_id = i.id
      join sigzap_messages m on m.conversation_id = sc.id
     where i.provider = 'chakra' and i.phone_number = p_phone
       and m.from_me and m.message_status in ('delivered', 'read') and m.sent_at > now() - interval '48 hours')
  -- Envio de teste (send_test) não vira mensagem no Sigma: o recibo de entrega do webhook também prova.
  or exists (
    select 1 from whatsapp_chakra_connections c
      join whatsapp_chakra_webhook_events e on e.phone_number_id = c.phone_number_id
     where c.phone_e164 = p_phone and e.event_type in ('status', 'statuses') and e.received_at > now() - interval '48 hours'
       and lower(coalesce(e.payload -> 'item' ->> 'status', e.payload ->> 'deliveryStatus', '')) in ('delivered', 'read'));
$$;

-- Status de entrega de uma mensagem pelo webhook da Chakra (versão do monitor, sem checar usuário:
-- a whatsapp_envio_teste_status exige admin logado e o cron roda como service_role).
create or replace function public.whatsapp_monitor_status_mensagem(p_message_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', lower(coalesce(e.payload -> 'item' ->> 'status', e.payload ->> 'deliveryStatus', e.payload -> 'statuses' -> 0 ->> 'status', '')),
      'erro', coalesce(e.payload -> 'item' -> 'errors' -> 0 ->> 'title', e.payload -> 'errorContext' ->> 'message', e.payload -> 'statuses' -> 0 -> 'errors' -> 0 ->> 'title'))
    from whatsapp_chakra_webhook_events e
    where length(coalesce(p_message_id, '')) > 10
      and e.event_type in ('status', 'statuses')
      and e.received_at > now() - interval '12 hours'
      and e.payload::text like '%' || p_message_id || '%'
    -- "delivered"/"read"/"failed" ganham de "sent" (chegam quase juntos).
    order by case lower(coalesce(e.payload -> 'item' ->> 'status', e.payload ->> 'deliveryStatus', ''))
               when 'failed' then 0 when 'read' then 1 when 'delivered' then 2 else 3 end, e.received_at desc
    limit 1
  ), jsonb_build_object('status', 'aguardando'));
$$;

revoke all on function public.whatsapp_monitor_entregou_48h(text) from public, anon, authenticated;
revoke all on function public.whatsapp_monitor_status_mensagem(text) from public, anon, authenticated;
grant execute on function public.whatsapp_monitor_entregou_48h(text) to service_role;
grant execute on function public.whatsapp_monitor_status_mensagem(text) to service_role;
