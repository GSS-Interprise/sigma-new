-- Tipo do número de WhatsApp: escalas e clientes, e tempo de resposta separado por tipo (Raul, 24/11).
-- Doc: docs/arquitetura/tempo-de-resposta-atendimento.md §3g.
--
-- Por que existe: prospecção (chips que captam médicos), escalas (equipe que fala com os médicos já escalados) e
-- clientes (hospitais) são operações diferentes; misturar tudo num tempo de resposta só esconde quem está atrasando.
-- O tipo continua em whatsapp_chakra_connections.uso, editado em Números WhatsApp pela RPC whatsapp_numero_atualizar
-- (ela não valida o valor: quem barra valor errado é o check abaixo).
-- Campanha continua usando só uso = 'prospeccao' (campanha_assistente): escalas e clientes nunca disparam campanha.

alter table public.whatsapp_chakra_connections
  drop constraint if exists whatsapp_chakra_connections_uso_check;
alter table public.whatsapp_chakra_connections
  add constraint whatsapp_chakra_connections_uso_check
  check (uso in ('prospeccao', 'escalas', 'clientes', 'financeiro', 'pessoal'));

-- Indicadores e série ganham p_uso (null = todos os números). Troca de assinatura: derruba a versão de 2 / 3
-- parâmetros antes, senão a chamada com argumentos nomeados fica ambígua entre as duas versões.
-- Número que não está em whatsapp_chakra_connections não tem tipo: entra só em "todos".
drop function if exists public.atendimento_indicadores(timestamptz, timestamptz);
drop function if exists public.atendimento_indicadores_base(timestamptz, timestamptz);
drop function if exists public.atendimento_serie(timestamptz, timestamptz, text);
drop function if exists public.atendimento_serie_base(timestamptz, timestamptz, text);

create or replace function public.atendimento_indicadores_base(p_de timestamptz, p_ate timestamptz, p_uso text default null)
returns table(pessoa_id uuid, pessoa text, esperas integer, respondidas integer, mediana_min numeric, em_10min integer, sem_resposta integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
      -- O filtro é por conversa inteira (o número é da conversa), então o lag acima não perde a mensagem anterior.
      and (p_uso is null or exists (
        select 1 from whatsapp_chakra_connections cu
        where cu.uso = p_uso
          and regexp_replace(cu.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')))
  ),
  esperas as (
    select e.conversation_id, e.sent_at as desde from msgs e
    where not e.from_me and coalesce(e.anterior_nossa, true) and e.sent_at >= p_de and e.sent_at < p_ate
  ),
  resp as (
    select es.conversation_id, es.desde, r.sent_at as respondida_em, r.sent_by_user_id, r.celular
    from esperas es
    left join lateral (
      select m.sent_at, m.sent_by_user_id, m.celular from msgs m
      where m.conversation_id = es.conversation_id and m.from_me and m.sent_at > es.desde
      order by m.sent_at limit 1
    ) r on true
  ),
  dono as (
    select r.*,
      (r.respondida_em is not null and r.sent_by_user_id is null and not coalesce(r.celular, false)) as automatica,
      case when r.sent_by_user_id is not null then r.sent_by_user_id
           when r.respondida_em is null or r.celular then cc.responsavel_id end as pessoa_id
    from resp r
    join sigzap_conversations c on c.id = r.conversation_id
    join sigzap_instances i on i.id = c.instance_id
    left join whatsapp_chakra_connections cc
      on regexp_replace(cc.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')
  )
  select d.pessoa_id,
         case when d.automatica then 'Automático (IA, campanha)' else coalesce(max(p.nome_completo), 'Número sem responsável') end,
         count(*)::int, count(d.respondida_em)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from d.respondida_em - d.desde) / 60.0)
                filter (where d.respondida_em is not null))::numeric, 1),
         count(*) filter (where d.respondida_em - d.desde <= interval '10 minutes')::int,
         count(*) filter (where d.respondida_em is null)::int
  from dono d left join profiles p on p.id = d.pessoa_id
  group by d.pessoa_id, d.automatica
  order by d.automatica, 3 desc, 2
$function$;

create or replace function public.atendimento_serie_base(p_de timestamptz, p_ate timestamptz, p_bucket text default 'hour', p_uso text default null)
returns table(bucket timestamptz, esperas integer, em_meta integer, depois integer, sem_resposta integer, mediana_min numeric, automaticas integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cfg as (select coalesce((select meta_minutos from atendimento_config where id), 10) as meta),
  msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
      and (p_uso is null or exists (
        select 1 from whatsapp_chakra_connections cu
        where cu.uso = p_uso
          and regexp_replace(cu.phone_e164, '\D', '', 'g') = regexp_replace(i.phone_number, '\D', '', 'g')))
  ),
  esperas as (
    select e.conversation_id, e.sent_at as desde from msgs e
    where not e.from_me and coalesce(e.anterior_nossa, true) and e.sent_at >= p_de and e.sent_at < p_ate
  ),
  resp as (
    select es.desde, r.sent_at as respondida_em,
           (r.sent_at is not null and r.sent_by_user_id is null and not coalesce(r.celular, false)) as automatica
    from esperas es
    left join lateral (
      select m.sent_at, m.sent_by_user_id, m.celular from msgs m
      where m.conversation_id = es.conversation_id and m.from_me and m.sent_at > es.desde
      order by m.sent_at limit 1
    ) r on true
  )
  select (date_trunc(case when p_bucket = 'day' then 'day' else 'hour' end, r.desde at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as bucket,
         count(*) filter (where not r.automatica)::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde <= make_interval(mins => (select meta from cfg)))::int,
         count(*) filter (where not r.automatica and r.respondida_em - r.desde > make_interval(mins => (select meta from cfg)))::int,
         count(*) filter (where r.respondida_em is null)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from r.respondida_em - r.desde) / 60.0)
                filter (where r.respondida_em is not null and not r.automatica))::numeric, 1),
         count(*) filter (where r.automatica)::int
  from resp r
  group by 1
  order by 1
$function$;

create or replace function public.atendimento_indicadores(p_de timestamptz, p_ate timestamptz, p_uso text default null)
returns table(pessoa_id uuid, pessoa text, esperas integer, respondidas integer, mediana_min numeric, em_10min integer, sem_resposta integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_ate <= p_de or p_ate - p_de > interval '31 days' then raise exception 'período inválido (até 31 dias)'; end if;
  return query select * from public.atendimento_indicadores_base(p_de, p_ate, p_uso);
end $function$;

create or replace function public.atendimento_serie(p_de timestamptz, p_ate timestamptz, p_bucket text default 'hour', p_uso text default null)
returns table(bucket timestamptz, esperas integer, em_meta integer, depois integer, sem_resposta integer, mediana_min numeric, automaticas integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.atendimento_pode_ver(auth.uid()) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_ate <= p_de or p_ate - p_de > interval '31 days' then raise exception 'período inválido (até 31 dias)'; end if;
  return query select * from public.atendimento_serie_base(p_de, p_ate, p_bucket, p_uso);
end $function$;

-- As _base são só do servidor (edge, agente); as públicas checam atendimento_pode_ver.
revoke all on function public.atendimento_indicadores_base(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.atendimento_serie_base(timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.atendimento_indicadores_base(timestamptz, timestamptz, text) to service_role;
grant execute on function public.atendimento_serie_base(timestamptz, timestamptz, text, text) to service_role;
revoke all on function public.atendimento_indicadores(timestamptz, timestamptz, text) from public, anon;
revoke all on function public.atendimento_serie(timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.atendimento_indicadores(timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.atendimento_serie(timestamptz, timestamptz, text, text) to authenticated, service_role;
