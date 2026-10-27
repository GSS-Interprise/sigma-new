-- Números da equipe ligados pelo Chakra (coexistência): cada número tem um dono (a pessoa da
-- prospecção que usa aquele WhatsApp Business). Uma pessoa pode ter mais de um número.
-- Reunião com Ramone e Vinicius, 27/10: é a base dos indicadores por pessoa e por campanha.

alter table public.whatsapp_chakra_connections
  add column if not exists responsavel_id uuid references public.profiles(id) on delete set null;

create index if not exists whatsapp_chakra_connections_responsavel_idx
  on public.whatsapp_chakra_connections (responsavel_id);

-- A tabela só aceita escrita de admin (RLS). Definir o dono também pode quem configura
-- chips/números da captação (Vinicius), sem abrir o resto da linha.
create or replace function public.definir_responsavel_numero(p_phone_number_id text, p_responsavel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin(auth.uid())
          or public.has_role(auth.uid(), 'gestor_captacao'::app_role)
          or public.has_captacao_permission(auth.uid(), 'seigzaps_config')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  update public.whatsapp_chakra_connections
     set responsavel_id = p_responsavel_id, updated_at = now()
   where phone_number_id = p_phone_number_id;
  if not found then
    raise exception 'numero_nao_encontrado';
  end if;
end;
$$;

revoke all on function public.definir_responsavel_numero(text, uuid) from public;
grant execute on function public.definir_responsavel_numero(text, uuid) to authenticated, service_role;

-- Mensagem que a pessoa mandou do próprio celular (eco do Chakra, sem campanha e sem usuário)
-- passa a contar para o dono do número. Sem isso, o BI lê sent_by_user_id vazio como envio
-- automático (IA) e o trabalho da equipe some dos indicadores.
create or replace function public.sigzap_mensagem_dono_do_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.from_me and new.provider = 'chakra' and new.sent_by_user_id is null and new.campanha_lead_id is null then
    select c.responsavel_id into new.sent_by_user_id
      from public.sigzap_conversations conv
      join public.sigzap_instances i on i.id = conv.instance_id
      join public.whatsapp_chakra_connections c on i.external_ref = 'chakra:' || c.phone_number_id
     where conv.id = new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sigzap_mensagem_dono_do_numero on public.sigzap_messages;
create trigger trg_sigzap_mensagem_dono_do_numero
  before insert on public.sigzap_messages
  for each row execute function public.sigzap_mensagem_dono_do_numero();
