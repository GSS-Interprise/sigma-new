-- Fase 3 do plano GSS dono no comando: tela Conversas no formato WhatsApp, só números oficiais (Chakra).

-- Barra de números no topo da tela: cada número oficial com não lidas e situação.
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
    coalesce(c.display_name, i.profile_name, i.name),
    coalesce(c.uso, 'prospeccao'),
    c.disponibilidade,
    p.nome_completo,
    coalesce((select sum(sc.unread_count) from sigzap_conversations sc where sc.instance_id = i.id and sc.unread_count > 0), 0)
  from sigzap_instances i
  left join whatsapp_chakra_connections c on c.phone_e164 = i.phone_number
  left join profiles p on p.id = c.responsavel_id
  where i.provider = 'chakra'
    and coalesce(i.status, '') <> 'deleted'
    and auth.uid() is not null
  order by coalesce(c.uso, 'prospeccao') = 'financeiro', i.phone_number;
$$;

revoke all on function public.conversas_numeros() from public, anon;
grant execute on function public.conversas_numeros() to authenticated, service_role;

-- Modelos aprovados do número desta conversa (fora da janela de 24 h só sai modelo).
create or replace function public.conversa_modelos(p_conversation_id uuid)
returns table (template_id uuid, friendly_name text, body text, variables jsonb, category text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.friendly_name, t.body, t.variables, coalesce(t.category, t.twilio_payload ->> 'category')
  from sigzap_conversations sc
  join sigzap_instances i on i.id = sc.instance_id and i.provider = 'chakra'
  join whatsapp_official_senders s on s.provider = 'chakra' and s.sender_sid = i.external_ref
  join whatsapp_official_templates t
    on t.provider = 'chakra'
   and t.approval_status = 'approved'
   and t.content_sid like 'chakra:' || s.chakra_plugin_id || ':%'
   and t.body !~ '�|Ã'
   and t.friendly_name !~ '^gss_teste'
  where sc.id = p_conversation_id
    and auth.uid() is not null
  order by coalesce(t.category, t.twilio_payload ->> 'category') = 'MARKETING' desc, t.friendly_name;
$$;

revoke all on function public.conversa_modelos(uuid) from public, anon;
grant execute on function public.conversa_modelos(uuid) to authenticated, service_role;

-- Pessoa assume a conversa: vira dona dela e a IA da campanha para de responder esse médico.
create or replace function public.conversa_assumir(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lead uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  update sigzap_conversations
     set assigned_user_id = coalesce(assigned_user_id, v_user),
         assigned_at = coalesce(assigned_at, now()),
         updated_at = now()
   where id = p_conversation_id
  returning lead_id into v_lead;

  if v_lead is not null then
    update campanha_leads cl
       set humano_assumiu = true,
           assumido_por = coalesce(cl.assumido_por, v_user),
           assumido_em = coalesce(cl.assumido_em, now()),
           updated_at = now()
      from campanhas c
     where c.id = cl.campanha_id
       and cl.lead_id = v_lead
       and c.status in ('ativa', 'pausada')
       and coalesce(cl.humano_assumiu, false) = false;
  end if;
end;
$$;

revoke all on function public.conversa_assumir(uuid) from public, anon;
grant execute on function public.conversa_assumir(uuid) to authenticated, service_role;
