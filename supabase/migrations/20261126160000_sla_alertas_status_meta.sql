-- Status real da Meta nos avisos do SLA (26/11/2026). O motor gravava "enviado" quando a Chakra aceitava o envio e
-- nada mais mudava: em 26/11 avisos barrados pela Meta ("healthy ecosystem engagement", "Business Account locked")
-- apareciam como enviados na tela e no histórico do exame. Este gatilho lê cada status que chega da Chakra e acerta a
-- linha do aviso pelo wamid (mensagem_id): delivered = entregue, read = lido, failed = falhou com o motivo.
-- Nunca rebaixa "respondido" nem volta de lido para entregue. Erro aqui não derruba o webhook (exception).
create or replace function public.fn_sla_alertas_status_meta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id text := coalesce(new.payload->'item'->>'id', new.payload->'statuses'->0->>'id');
  v_st text := coalesce(new.payload->'item'->>'status', new.payload->'statuses'->0->>'status');
  v_err jsonb := coalesce(new.payload->'item'->'errors'->0, new.payload->'statuses'->0->'errors'->0);
begin
  if v_id is null or v_id not like 'wamid.%' or v_st is null then return new; end if;
  if v_st = 'failed' then
    update sla_alertas set status = 'falhou',
           erro = left(concat_ws(' ', 'Meta', v_err->>'code', ':', coalesce(v_err->>'title', v_err->>'message')), 300)
     where mensagem_id = v_id and status <> 'respondido';
  elsif v_st = 'delivered' then
    update sla_alertas set status = 'entregue' where mensagem_id = v_id and status in ('pendente', 'enviado');
  elsif v_st = 'read' then
    update sla_alertas set status = 'lido' where mensagem_id = v_id and status in ('pendente', 'enviado', 'entregue');
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_sla_alertas_status_meta on public.whatsapp_chakra_webhook_events;
create trigger trg_sla_alertas_status_meta after insert on public.whatsapp_chakra_webhook_events
  for each row when (new.event_type = 'statuses') execute function public.fn_sla_alertas_status_meta();

-- Acerto dos avisos já enviados (desde 12/11): aplica o status mais adiantado que a Meta mandou para cada wamid.
with ev as (
  select coalesce(w.payload->'item'->>'id', w.payload->'statuses'->0->>'id') as id,
         coalesce(w.payload->'item'->>'status', w.payload->'statuses'->0->>'status') as st,
         coalesce(w.payload->'item'->'errors'->0, w.payload->'statuses'->0->'errors'->0) as err
    from whatsapp_chakra_webhook_events w
   where w.event_type = 'statuses' and w.received_at > '2026-11-12'
),
pior as (
  select distinct on (id) id, st, err from ev
   where id in (select mensagem_id from sla_alertas where mensagem_id like 'wamid.%')
   order by id, case st when 'failed' then 0 when 'read' then 1 when 'delivered' then 2 else 3 end
)
update sla_alertas a set
  status = case p.st when 'failed' then 'falhou' when 'read' then 'lido' when 'delivered' then 'entregue' else a.status end,
  erro = case when p.st = 'failed' then left(concat_ws(' ', 'Meta', p.err->>'code', ':', coalesce(p.err->>'title', p.err->>'message')), 300) else a.erro end
  from pior p
 where a.mensagem_id = p.id and a.status <> 'respondido';
