-- Revisão 12/11: o aviso 141006 (pagamento) do healthStatus da Meta fica preso mesmo depois que o
-- cartão da BM passa a pagar. O 93618-3416 tinha o aviso e entregou 157 primeiros contatos de
-- campanha em 24 h, sem nenhuma falha de pagamento desde 05/11. Regra: envio real ganha
-- (feedback 05/11, "só teste real vale"). Com campanha entregue nos últimos 2 dias, o aviso é ignorado.

create or replace function public.whatsapp_numeros_recalcular_disponibilidade()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  with base as (
    select
      c.id,
      c.status,
      c.quality_rating,
      c.name_status,
      c.provider_payload -> 'phone' -> 'healthStatus' as health,
      i.id as instance_id
    from whatsapp_chakra_connections c
    left join lateral (
      select si.id from sigzap_instances si
      where si.provider = 'chakra' and si.phone_number = c.phone_e164
      order by si.updated_at desc nulls last limit 1
    ) i on true
  ),
  envio as (
    -- "received" em mensagem nossa é eco do celular (coexistência), não envio pela API.
    select b.id,
      count(m.*) filter (where m.message_status is distinct from 'received') as enviadas,
      count(m.*) filter (where m.message_status = 'failed') as falhas,
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read')) as ultima_entrega,
      -- Primeiro contato de campanha entregue: só sai com modelo pago, então prova que o pagamento passa.
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read') and m.campanha_lead_id is not null) as ultima_campanha_entregue
    from base b
    left join sigzap_conversations sc on sc.instance_id = b.instance_id
    left join sigzap_messages m on m.conversation_id = sc.id and m.from_me and m.sent_at > now() - interval '7 days'
    group by b.id
  ),
  regra as (
    select b.id,
      exists (
        select 1 from jsonb_array_elements(coalesce(b.health -> 'entities', '[]'::jsonb)) e
        where e ->> 'entity_type' = 'WABA' and e ->> 'can_send_message' = 'BLOCKED'
          and (e -> 'errors')::text like '%141006%'
      ) as pagamento_bloqueado,
      exists (
        select 1 from jsonb_array_elements(coalesce(b.health -> 'entities', '[]'::jsonb)) e
        where e ->> 'entity_type' in ('WABA', 'BUSINESS') and e ->> 'can_send_message' = 'BLOCKED'
          and (e -> 'errors')::text not like '%141006%'
      ) as conta_bloqueada,
      b.status, b.quality_rating, b.name_status, b.instance_id,
      e.enviadas, e.falhas, e.ultima_entrega, e.ultima_campanha_entregue
    from base b join envio e on e.id = b.id
  ),
  calc as (
    select id,
      case
        when status = 'desconectado' then 'indisponivel'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'indisponivel'
        when conta_bloqueada then 'indisponivel'
        when instance_id is null then 'indisponivel'
        when pagamento_bloqueado and coalesce(ultima_campanha_entregue, '-infinity') < now() - interval '2 days' then 'atencao'
        when enviadas >= 10 and falhas::numeric / enviadas >= 0.2 then 'atencao'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'atencao'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'atencao'
        else 'disponivel'
      end as disp,
      case
        when status = 'desconectado' then 'Desligado manualmente no Sigma.'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'Qualidade vermelha na Meta: risco de perder o número.'
        when conta_bloqueada then 'A Meta bloqueou o envio da conta (não é pagamento). Ver o painel da Chakra.'
        when instance_id is null then 'Nenhuma mensagem deste número chega ao Sigma desde a conexão.'
        when pagamento_bloqueado and coalesce(ultima_campanha_entregue, '-infinity') < now() - interval '2 days'
          then 'A Meta aponta pagamento pendente (141006). Faça um envio de teste: o 3416 tem o mesmo aviso e entrega.'
        when enviadas >= 10 and falhas::numeric / enviadas >= 0.2
          then round(100 * falhas::numeric / enviadas) || '% das mensagens falharam nos últimos 7 dias.'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'Nome de exibição recusado: limite de envio reduzido.'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'Nenhuma entrega nos últimos 7 dias.'
        else 'Entregando normalmente.'
      end as motivo
    from regra
  )
  update whatsapp_chakra_connections c
     set disponibilidade = calc.disp,
         disponibilidade_motivo = calc.motivo,
         disponibilidade_em = now()
    from calc
   where calc.id = c.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

select public.whatsapp_numeros_recalcular_disponibilidade();
