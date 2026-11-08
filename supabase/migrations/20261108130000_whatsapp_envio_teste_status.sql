-- Resultado do envio de teste (Configurações › WhatsApp): a Chakra responde "aceito" na hora,
-- mas entregue/falhou (ex.: 141006, 131042) só chega depois pelo webhook de status.
-- Procura o evento de status do wamid enviado e devolve o último estado.
create or replace function public.whatsapp_envio_teste_status(p_message_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', lower(coalesce(e.payload ->> 'deliveryStatus', e.payload -> 'statuses' -> 0 ->> 'status', '')),
      'erro', coalesce(e.payload -> 'errorContext' ->> 'message', e.payload -> 'statuses' -> 0 -> 'errors' -> 0 ->> 'title'),
      'recebido_em', e.received_at
    )
    from whatsapp_chakra_webhook_events e
    where length(coalesce(p_message_id, '')) > 10
      and e.event_type in ('status', 'statuses')
      and e.received_at > now() - interval '2 hours'
      and e.payload::text like '%' || p_message_id || '%'
    order by e.received_at desc
    limit 1
  ), jsonb_build_object('status', 'aguardando'))
  where public.is_admin(auth.uid()) or public.has_captacao_permission(auth.uid(), 'seigzaps_config');
$$;

revoke all on function public.whatsapp_envio_teste_status(text) from public, anon;
grant execute on function public.whatsapp_envio_teste_status(text) to authenticated, service_role;

-- Responsável e uso editáveis pela tela (só admin / quem configura WhatsApp).
create or replace function public.whatsapp_numero_atualizar(p_connection_id uuid, p_responsavel_id uuid, p_uso text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin(auth.uid()) or public.has_captacao_permission(auth.uid(), 'seigzaps_config')) then
    raise exception 'sem_permissao';
  end if;
  update whatsapp_chakra_connections
     set responsavel_id = p_responsavel_id,
         uso = coalesce(p_uso, uso),
         updated_at = now()
   where id = p_connection_id;
end;
$$;

revoke all on function public.whatsapp_numero_atualizar(uuid, uuid, text) from public, anon;
grant execute on function public.whatsapp_numero_atualizar(uuid, uuid, text) to authenticated, service_role;
