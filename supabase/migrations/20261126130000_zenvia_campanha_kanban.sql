-- Kanban da campanha Zenvia (26/11/2026, Raul: "as campanhas do Zenvia a gente não pode abrir e enxergar o Kanban
-- acontecendo, nem as conversas dos médicos dentro, como a gente faz nos outros").
-- Um cartão por médico (telefone) que recebeu disparo da Zenvia na especialidade, na etapa mais adiantada que ele
-- chegou: Respondeu > Leu > Entregue > Enviado; Não entregue quando nenhum disparo saiu. conversa_id = a conversa do
-- número Zenvia no Sigma (só existe para quem respondeu, ver zenvia_espelhar_evento), para abrir em /conversas.
-- p_especialidade null = disparos sem especialidade identificada (o "sem" da view zenvia_campanhas).
create or replace function public.zenvia_campanha_kanban(p_especialidade uuid)
returns table (telefone text, lead_id uuid, nome text, etapa text, disparos int, ultimo_em timestamptz, conversa_id uuid)
language sql stable security definer set search_path = public as $$
  with d as (
    select z.telefone, max(z.lead_id::text)::uuid as lead_id, count(*)::int as disparos, max(z.primeiro_em) as ultimo_em,
           bool_or(z.respondeu) as respondeu, bool_or(z.lido) as lido, bool_or(z.entregue) as entregue, bool_or(z.saiu) as saiu
      from zenvia_disparos z
     where auth.uid() is not null
       and z.especialidade_id is not distinct from p_especialidade
     group by z.telefone
  ),
  conv as (
    select distinct on (ct.contact_phone) ct.contact_phone, c.id
      from sigzap_conversations c
      join sigzap_contacts ct on ct.id = c.contact_id
      join sigzap_instances i on i.id = c.instance_id
     where i.provider = 'zenvia' and ct.contact_phone in (select telefone from d)
     order by ct.contact_phone, c.last_message_at desc nulls last, c.id
  )
  select d.telefone, d.lead_id, coalesce(nullif(trim(l.nome), ''), 'Médico sem cadastro') as nome,
         case when d.respondeu then 'respondeu' when d.lido then 'leu' when d.entregue then 'entregue'
              when d.saiu then 'enviado' else 'nao_entregue' end as etapa,
         d.disparos, d.ultimo_em, conv.id as conversa_id
    from d
    left join leads l on l.id = d.lead_id
    left join conv on conv.contact_phone = d.telefone
   order by d.ultimo_em desc nulls last, d.telefone;
$$;
revoke all on function public.zenvia_campanha_kanban(uuid) from public, anon;
grant execute on function public.zenvia_campanha_kanban(uuid) to authenticated;
