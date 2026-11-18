-- O cruzamento da Zenvia com o cadastro também olha os telefones adicionais do lead (18/11): no envio de 17/11,
-- 581 dos 1.665 telefones "sem lead" já estavam no Sigma como telefone adicional de um médico (sem "+", só dígitos).
-- Ordem: telefone principal (com e sem o 9) e, se não achar, telefones adicionais. Empate: o lead de id menor.
create or replace function public.zenvia_lead_por_telefone(p_tel text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
-- plpgsql com o vetor numa variável: assim o índice GIN de telefones_adicionais é usado (com subconsulta não era,
-- e o religamento de 1.665 telefones estourava o tempo).
declare
  d text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
  v text[];
  vmais text[];
  r uuid;
begin
  if length(d) < 12 then return null; end if;
  v := array[d];
  if length(d) = 12 then v := v || (substr(d, 1, 4) || '9' || substr(d, 5)); end if;
  if length(d) = 13 and substr(d, 5, 1) = '9' then v := v || (substr(d, 1, 4) || substr(d, 6)); end if;

  -- Vetor pronto (sem subconsulta) para o índice único de phone_e164 ser usado.
  vmais := array(select '+' || x from unnest(v) x);
  -- Sem ORDER BY ... LIMIT: com ele o plano genérico do plpgsql varria a chave primária (0,7 s por telefone).
  -- O desempate (número exato primeiro, depois o id menor) é feito no agregado, só sobre o que o índice achou.
  select (array_agg(l.id order by (l.phone_e164 = '+' || d) desc, l.id))[1] into r from public.leads l
   where l.merged_into_id is null and l.phone_e164 = any (vmais);
  if r is not null then return r; end if;

  select (array_agg(l.id order by l.id))[1] into r from public.leads l
   where l.merged_into_id is null and l.telefones_adicionais && v;
  return r;
end;
$$;

set local statement_timeout = '600s';

-- Religa os eventos já gravados que ficaram sem lead e grava o histórico que faltou (o gatilho de histórico só roda
-- no insert; aqui a mesma regra, uma vez por mensagem).
update public.zenvia_eventos e set lead_id = public.zenvia_lead_por_telefone(e.telefone_norm)
 where e.lead_id is null and e.telefone_norm is not null;

insert into public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, criado_em)
select e.lead_id, 'campanha_disparo', 'Disparo WhatsApp pela Zenvia: ' || coalesce(nullif(e.envio_nome, ''), 'Zenvia'),
       jsonb_build_object('origem', 'zenvia', 'zenvia_message_id', e.message_id, 'envio', coalesce(nullif(e.envio_nome, ''), 'Zenvia'),
                          'telefone', e.telefone_norm, 'status', e.status),
       coalesce(e.evento_em, now())
  from public.zenvia_eventos e
 where e.lead_id is not null and e.tipo = 'MESSAGE_STATUS' and e.status in ('SENT', 'DELIVERED', 'READ')
   and e.message_id is not null
   and not exists (select 1 from public.lead_historico h
                    where h.lead_id = e.lead_id and h.tipo_evento = 'campanha_disparo'
                      and h.metadados ->> 'zenvia_message_id' = e.message_id);
