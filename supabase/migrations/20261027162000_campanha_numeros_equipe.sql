-- Campanha trabalhada pelos números da equipe (reunião com Ramone e Vinicius, 27/10).
-- A campanha diz quais números (pessoas) prospectam a lista. Mensagem que sai do celular de um
-- desses números para um médico da lista conta como disparo daquela campanha: o médico vai
-- para "contatado" no Kanban, com a pessoa e o número que fizeram o primeiro contato.

alter table public.campanhas
  add column if not exists numeros_equipe text[] not null default '{}';
comment on column public.campanhas.numeros_equipe is
  'phone_number_id (whatsapp_chakra_connections) dos números da equipe que trabalham esta campanha';

alter table public.campanha_leads
  add column if not exists contato_numero_id text;
comment on column public.campanha_leads.contato_numero_id is
  'phone_number_id do número da equipe que fez o primeiro contato';

-- Registra a mensagem enviada do celular da equipe para um lead.
-- 1) Campanha que lista esse número e tem o médico ainda "frio": vira contatado (a mais recente).
-- 2) Sem isso, vale a regra antiga: a campanha manual mais recente com o médico frio.
-- Só uma campanha ganha o primeiro contato, para um envio não contar em várias ao mesmo tempo.
-- As outras campanhas abertas com o médico só atualizam o último contato.
create or replace function public.registrar_contato_equipe(
  p_lead_id uuid,
  p_phone_number_id text,
  p_conversa_id uuid,
  p_quando timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono uuid;
  v_alvo uuid;
  v_outras int;
begin
  select responsavel_id into v_dono
    from whatsapp_chakra_connections where phone_number_id = p_phone_number_id;

  select cl.id into v_alvo
    from campanha_leads cl join campanhas c on c.id = cl.campanha_id
   where cl.lead_id = p_lead_id and cl.status = 'frio'
     and c.status in ('ativa', 'pausada')
     and p_phone_number_id = any(c.numeros_equipe)
   order by c.created_at desc limit 1;

  if v_alvo is null then
    select cl.id into v_alvo
      from campanha_leads cl join campanhas c on c.id = cl.campanha_id
     where cl.lead_id = p_lead_id and cl.status = 'frio'
       and c.status in ('ativa', 'pausada')
       and coalesce(c.tipo_envio, 'ia') = 'manual'
     order by cl.created_at desc limit 1;
  end if;

  if v_alvo is not null then
    update campanha_leads set
      status = 'contatado',
      data_status = p_quando,
      data_primeiro_contato = coalesce(data_primeiro_contato, p_quando),
      data_ultimo_contato = p_quando,
      humano_assumiu = true,
      canal_atual = 'whatsapp',
      assumido_por = coalesce(assumido_por, v_dono),
      contato_numero_id = coalesce(contato_numero_id, p_phone_number_id),
      conversa_id = coalesce(p_conversa_id, conversa_id)
    where id = v_alvo and status = 'frio';

    -- a tarefa de WhatsApp pendente desse médico fica feita por quem mandou
    update campanha_lead_tasks set status = 'feita', feita_em = p_quando, feita_por = v_dono, updated_at = now()
     where id = (select t.id from campanha_lead_tasks t
                  where t.campanha_lead_id = v_alvo and t.status = 'pendente' and t.tipo like 'whatsapp%'
                  order by t.ordem nulls last, t.created_at limit 1);
  end if;

  update campanha_leads cl set data_ultimo_contato = p_quando, humano_assumiu = true
    from campanhas c
   where c.id = cl.campanha_id and cl.lead_id = p_lead_id
     and c.status in ('ativa', 'pausada')
     and cl.status in ('contatado', 'sem_resposta', 'em_conversa', 'aquecido', 'quente')
     and cl.id is distinct from v_alvo;
  get diagnostics v_outras = row_count;

  return jsonb_build_object('contatado', v_alvo, 'em_andamento', v_outras, 'dono', v_dono);
end;
$$;

revoke all on function public.registrar_contato_equipe(uuid, text, uuid, timestamptz) from public;
grant execute on function public.registrar_contato_equipe(uuid, text, uuid, timestamptz) to service_role;
