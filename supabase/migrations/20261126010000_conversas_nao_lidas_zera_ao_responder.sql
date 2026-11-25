-- Não lidas de Conversas só sobe (25/11/2026). Quem responde pelo celular (eco da coexistência) ou pelo Sigma não
-- zerava o contador: conversas com 36, 52, 62 "não lidas" tinham 1 a 3 mensagens do médico depois da última resposta.
-- Regra nova: mensagem nossa (from_me) recalcula o contador = mensagens do contato depois dela. Vale também para
-- mensagem antiga do histórico: a conta usa a data real (sent_at), então eco antigo não zera resposta nova.
-- Limite: a leitura feita no celular sem responder não chega ao Sigma (a Meta não manda esse evento na coexistência).

create or replace function public.fn_sigzap_nao_lidas_ao_responder()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.from_me is true and new.conversation_id is not null then
    update sigzap_conversations c
       set unread_count = (select count(*) from sigzap_messages m
                            where m.conversation_id = new.conversation_id and m.from_me is false
                              and m.sent_at > (select max(x.sent_at) from sigzap_messages x
                                                where x.conversation_id = new.conversation_id and x.from_me is true))
     where c.id = new.conversation_id and c.unread_count > 0;
  end if;
  return null;
end $$;

drop trigger if exists trg_sigzap_nao_lidas_ao_responder on public.sigzap_messages;
create trigger trg_sigzap_nao_lidas_ao_responder after insert on public.sigzap_messages
  for each row execute function public.fn_sigzap_nao_lidas_ao_responder();

-- Correção de uma vez: conversas com não lidas passam a contar só o que veio depois da última mensagem nossa.
with ultima as (
  select c.id, (select max(m.sent_at) from sigzap_messages m where m.conversation_id = c.id and m.from_me is true) nossa
    from sigzap_conversations c where c.unread_count > 0
)
update sigzap_conversations c
   set unread_count = (select count(*) from sigzap_messages m
                        where m.conversation_id = c.id and m.from_me is false
                          and m.sent_at > coalesce(u.nossa, '-infinity'::timestamptz))
  from ultima u
 where u.id = c.id;
