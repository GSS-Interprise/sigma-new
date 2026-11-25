-- Domínio "conversas" do agente do Sigma (pedido do Heron, 24/11/2026): o Claude dos sócios lê o CONTEÚDO das
-- conversas dos números oficiais do WhatsApp (Chakra). Código: supabase/functions/_shared/agente/dominios/conversas.ts.
-- Protocolo: docs/arquitetura/protocolo-agente-sigma.md. O domínio nasce SEM papel em agente_dominio_acessos:
-- o admin libera em Configurações › Agente do Sigma depois do ok de LGPD.

-- 1) Conversas com mensagem num período, já contadas no banco (o PostgREST corta em 1000 linhas e o hash precisa do
--    mesmo recorte para todo sócio). Quem filtra os números permitidos (lista de usos; pessoal nunca) é a edge, em
--    p_instancias: a função não decide permissão, só conta.
--    "Sem resposta no período" = a última mensagem da conversa DENTRO do período é do contato.
create or replace function public.agente_conversas_base(
  p_de timestamptz,
  p_ate timestamptz,
  p_instancias uuid[],
  p_contato text default null,
  p_so_sem_resposta boolean default false,
  p_limite integer default null
)
returns table (
  conversation_id uuid, instance_id uuid, contato text, contato_marcado text, fone_final text,
  recebidas integer, enviadas integer, primeira_em timestamptz, ultima_em timestamptz,
  ultima_do_contato boolean, ultima_texto text, total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with msg as (
    select m.conversation_id, c.instance_id, c.contact_id, c.lead_id,
           count(*) filter (where not m.from_me)::int recebidas,
           count(*) filter (where m.from_me)::int enviadas,
           min(m.sent_at) primeira_em, max(m.sent_at) ultima_em,
           -- desempate por id: duas mensagens no mesmo segundo não podem trocar a "última" entre chamadas.
           (array_agg(not m.from_me order by m.sent_at desc, m.id desc))[1] ultima_do_contato,
           (array_agg(coalesce(nullif(m.message_text, ''), '[' || m.message_type || ']') order by m.sent_at desc, m.id desc))[1] ultima_texto
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    where m.sent_at >= p_de and m.sent_at < p_ate
      and c.instance_id = any(p_instancias)
    group by m.conversation_id, c.instance_id, c.contact_id, c.lead_id
  ),
  com_nome as (
    select x.*, ct.contact_name, l.nome lead_nome, ac.nome marcado,
           regexp_replace(coalesce(ct.contact_phone, split_part(ct.contact_jid, '@', 1), ''), '\D', '', 'g') fone
    from msg x
    left join sigzap_contacts ct on ct.id = x.contact_id
    left join leads l on l.id = x.lead_id
    left join atendimento_contatos ac
      on ac.telefone = regexp_replace(coalesce(ct.contact_phone, split_part(ct.contact_jid, '@', 1), ''), '\D', '', 'g')
  ),
  filtrado as (
    select n.*
    from com_nome n
    where (not coalesce(p_so_sem_resposta, false) or n.ultima_do_contato)
      and (
        nullif(trim(coalesce(p_contato, '')), '') is null
        -- 4+ dígitos = telefone (qualquer pedaço); senão, nome sem acento em qualquer das 3 fontes de nome.
        or (length(regexp_replace(p_contato, '\D', '', 'g')) >= 4 and n.fone like '%' || regexp_replace(p_contato, '\D', '', 'g') || '%')
        or (length(regexp_replace(p_contato, '\D', '', 'g')) < 4 and (
              unaccent(lower(coalesce(n.marcado, ''))) like '%' || unaccent(lower(trim(p_contato))) || '%'
           or unaccent(lower(coalesce(n.contact_name, ''))) like '%' || unaccent(lower(trim(p_contato))) || '%'
           or unaccent(lower(coalesce(n.lead_nome, ''))) like '%' || unaccent(lower(trim(p_contato))) || '%'))
      )
  )
  select f.conversation_id, f.instance_id,
         coalesce(nullif(trim(f.marcado), ''), nullif(trim(f.contact_name), ''), nullif(trim(f.lead_nome), ''), 'contato final ' || right(f.fone, 4)),
         nullif(trim(f.marcado), ''), right(f.fone, 4),
         f.recebidas, f.enviadas, f.primeira_em, f.ultima_em, f.ultima_do_contato, left(f.ultima_texto, 200),
         count(*) over ()
  from filtrado f
  order by f.ultima_em desc, f.conversation_id
  limit p_limite
$$;

-- 2) Resumo por número no período (mesma base, sem corte de linhas).
create or replace function public.agente_conversas_por_numero(p_de timestamptz, p_ate timestamptz, p_instancias uuid[])
returns table (instance_id uuid, conversas integer, recebidas integer, enviadas integer, sem_resposta integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.instance_id, count(*)::int, sum(b.recebidas)::int, sum(b.enviadas)::int,
         count(*) filter (where b.ultima_do_contato)::int
  from public.agente_conversas_base(p_de, p_ate, p_instancias) b
  group by b.instance_id
  order by b.instance_id
$$;

-- Só a edge (service role) lê conteúdo de conversa por aqui; nunca a tela nem o anon.
revoke all on function public.agente_conversas_base(timestamptz, timestamptz, uuid[], text, boolean, integer) from public, anon, authenticated;
revoke all on function public.agente_conversas_por_numero(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.agente_conversas_base(timestamptz, timestamptz, uuid[], text, boolean, integer) to service_role;
grant execute on function public.agente_conversas_por_numero(timestamptz, timestamptz, uuid[]) to service_role;

-- 3) Token da bateria de consistência (scripts/agente-consistencia.ts): origem 'bateria' vê todos os domínios ativos,
--    inclusive os que ainda não têm papel (domínio novo é testado ANTES de ser liberado, §3i). Só o service role /
--    Management API grava essa origem: mcp_gerar_token sempre grava 'manual', o OAuth grava 'oauth' e o usuário só
--    pode alterar nome e revogado_em (grant por coluna). O script cria o token com 30 min e revoga no fim.
alter table public.mcp_tokens drop constraint if exists mcp_tokens_origem_ck;
alter table public.mcp_tokens add constraint mcp_tokens_origem_ck check (origem = any (array['manual', 'oauth', 'bateria']));
