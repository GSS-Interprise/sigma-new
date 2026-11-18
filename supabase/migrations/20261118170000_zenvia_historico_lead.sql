-- Zenvia no histórico do médico (Raul, 18/11: "precisamos ter o histórico dentro do Sigma de que aquele lead foi
-- impactado por uma campanha, aparecer no histórico"). Cada evento da Zenvia que chega (webhook ou importação da
-- planilha de envio) acha o lead pelo telefone e grava em lead_historico:
--   - campanha_disparo: uma vez por mensagem, no primeiro status de envio (SENT, DELIVERED ou READ);
--   - inbound_whatsapp: cada resposta do médico, com o começo do texto.
-- Não mexe em campanha_leads (os gatilhos de lá criam tarefas e avisos para a equipe).

alter table public.zenvia_eventos add column if not exists lead_id uuid;
alter table public.zenvia_eventos add column if not exists envio_nome text; -- nome do envio na Zenvia, quando se sabe (planilha)
create index if not exists zenvia_eventos_lead_idx on public.zenvia_eventos (lead_id);

-- Lead pelo telefone (só dígitos, com 55). Tenta com e sem o 9 do celular: a Zenvia e o WhatsApp às vezes devolvem
-- o número antigo de 12 dígitos.
create or replace function public.zenvia_lead_por_telefone(p_tel text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with t as (select regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') as d),
  v as (
    select '+' || d as e from t where length(d) >= 12
    union all
    -- 55 + DDD + 8 dígitos  ->  com o 9
    select '+' || substr(d, 1, 4) || '9' || substr(d, 5) from t where length(d) = 12
    union all
    -- 55 + DDD + 9 + 8 dígitos  ->  sem o 9
    select '+' || substr(d, 1, 4) || substr(d, 6) from t where length(d) = 13 and substr(d, 5, 1) = '9'
  )
  select l.id from public.leads l join v on l.phone_e164 = v.e
   where l.merged_into_id is null
   order by (l.phone_e164 = (select '+' || d from t)) desc, l.id
   limit 1;
$$;

create or replace function public.fn_zenvia_evento_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lead_id is null and new.telefone_norm is not null then
    new.lead_id := public.zenvia_lead_por_telefone(new.telefone_norm);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zenvia_evento_lead on public.zenvia_eventos;
create trigger trg_zenvia_evento_lead before insert on public.zenvia_eventos
  for each row execute function public.fn_zenvia_evento_lead();

create or replace function public.fn_zenvia_evento_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio text := coalesce(nullif(new.envio_nome, ''), 'Zenvia');
begin
  if new.lead_id is null then
    return null;
  end if;

  if new.tipo = 'MESSAGE_STATUS' and new.status in ('SENT', 'DELIVERED', 'READ') and new.message_id is not null
     and not exists (select 1 from public.lead_historico h
                      where h.lead_id = new.lead_id and h.tipo_evento = 'campanha_disparo'
                        and h.metadados ->> 'zenvia_message_id' = new.message_id) then
    insert into public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, criado_em)
    values (new.lead_id, 'campanha_disparo', 'Disparo WhatsApp pela Zenvia: ' || v_envio,
            jsonb_build_object('origem', 'zenvia', 'zenvia_message_id', new.message_id, 'envio', v_envio,
                               'telefone', new.telefone_norm, 'status', new.status),
            coalesce(new.evento_em, now()));
  elsif new.tipo = 'MESSAGE' and new.direcao = 'IN' then
    insert into public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, criado_em)
    values (new.lead_id, 'inbound_whatsapp',
            'Respondeu pela Zenvia' || coalesce(': ' || left(new.texto, 120), ''),
            jsonb_build_object('origem', 'zenvia', 'zenvia_evento_id', new.evento_id, 'telefone', new.telefone_norm),
            coalesce(new.evento_em, now()));
  end if;
  return null;
end;
$$;

drop trigger if exists trg_zenvia_evento_historico on public.zenvia_eventos;
create trigger trg_zenvia_evento_historico after insert on public.zenvia_eventos
  for each row execute function public.fn_zenvia_evento_historico();
