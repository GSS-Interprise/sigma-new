-- Filtro "Precisa de resposta" da tela Conversas (crítica /impeccable de 12/11, plano GSS dono no comando).
-- "Não lidas" passava de 999 misturando resposta quente com "SAIR", resposta automática de clínica e
-- quem já disse que não tem interesse. Aqui: a última mensagem é do médico, nos últimos 30 dias, e não é
-- descadastro, resposta automática, "não é o médico" nem conversa classificada como sem interesse,
-- contato errado ou fora do perfil (conversa_classificacao, Fase 7.2).
-- Retorna linhas de sigzap_conversations para a tela embutir contato e lead pelo PostgREST; roda com
-- as permissões de quem chama (security invoker), então a RLS da tabela continua valendo.
create or replace function public.conversas_precisa_resposta(p_instance_ids uuid[], p_contact_ids uuid[] default null)
returns setof public.sigzap_conversations
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
    from sigzap_conversations c
    cross join lateral (
      select m.from_me, coalesce(m.message_text, '') as texto
        from sigzap_messages m
       where m.conversation_id = c.id
       order by m.sent_at desc
       limit 1) u
   where c.instance_id = any(p_instance_ids)
     and (p_contact_ids is null or c.contact_id = any(p_contact_ids))
     and c.last_message_at > now() - interval '30 days'
     and not u.from_me
     and not coalesce(c.not_the_doctor, false)
     and u.texto !~* '^\s*(sair|parar|pare|stop|remover|descadastrar|cancelar)\s*[.!]*\s*$'
     -- Resposta automática de consultório (texto típico das saudações de WhatsApp Business).
     and u.texto !~* '(mensagem|resposta) autom[aá]tica|hor[aá]rio (de|do) atendimento|agrade(ce|cemos) (o |o seu |seu |pelo )?contato|obrigad[ao] pelo (seu )?contato|seja bem.vind|deixe (a )?sua mensagem|conv[eê]nios (credenciados|atendidos)|retornaremos (o mais breve|em breve)'
     -- Recusa educada que ainda não passou pela classificação.
     and u.texto !~* 'n([aã]o)? tenho (interesse|disponibilidade|hor[aá]rio)|sem interesse|n[aã]o (me )?interessa|agenda (est[aá] )?cheia'
     -- Fecho de conversa ("Não", "Muito obrigado", "Eu que agradeço"): não pede resposta.
     and u.texto !~* '^\s*(n[aã]o|muito obrigad[ao]|obrigad[ao]|eu que agrade[cç]o|agrade[cç]o|ok|blz|beleza)[\s,.!]*(obrigad[ao])?[\s.!]*$'
     and not exists (
       select 1 from conversa_classificacao cc
        where cc.lead_id = c.lead_id
          and cc.resultado in ('sem_interesse', 'contato_errado', 'fora_do_perfil'))
   order by c.last_message_at desc;
$$;

revoke all on function public.conversas_precisa_resposta(uuid[], uuid[]) from public, anon;
grant execute on function public.conversas_precisa_resposta(uuid[], uuid[]) to authenticated, service_role;
