-- Origem da mensagem nossa nos números Chakra: "celular" (alguém da equipe digitou no app, coexistence) ou "api"
-- (IA, campanha, tela do Sigma). O chakra-webhook grava raw_payload.origem desde 22/11/2026; aqui o histórico é
-- preenchido pelos eventos guardados em whatsapp_chakra_webhook_events (smb_message_echo = app; message_echo = API).
-- Sem isso, atendimento_indicadores contaria a resposta da IA (segundos) como resposta de pessoa.
update public.sigzap_messages m
set raw_payload = coalesce(m.raw_payload, '{}'::jsonb) || jsonb_build_object('origem', e.origem)
from (
  select distinct on (wamid) wamid, origem from (
    select coalesce(payload -> 'item' ->> 'id', payload -> 'item' -> 'message' ->> 'id') as wamid,
           'celular' as origem, 1 as pri
    from public.whatsapp_chakra_webhook_events where event_type in ('smb_message_echo', 'smb_message_echoes')
    union all
    select coalesce(payload -> 'message' ->> 'id', payload -> 'item' ->> 'id', payload -> 'item' -> 'message' ->> 'id'),
           'api', 2
    from public.whatsapp_chakra_webhook_events where event_type in ('message_echo', 'message_echoes')
  ) x where wamid is not null order by wamid, pri
) e
where m.from_me and m.wa_message_id = e.wamid and (m.raw_payload ->> 'origem') is null;

-- Indicadores: quem respondeu = usuário da tela do Sigma; senão, celular = responsável do número; senão automático.
create or replace function public.atendimento_indicadores_base(p_de timestamptz, p_ate timestamptz)
returns table (pessoa_id uuid, pessoa text, esperas int, respondidas int, mediana_min numeric, em_10min int, sem_resposta int)
language sql stable security definer set search_path = public as $$
  with msgs as (
    select m.conversation_id, m.sent_at, m.from_me, m.sent_by_user_id,
           (m.raw_payload ->> 'origem') = 'celular' as celular,
           lag(m.from_me) over (partition by m.conversation_id order by m.sent_at, m.id) as anterior_nossa
    from sigzap_messages m
    join sigzap_conversations c on c.id = m.conversation_id
    join sigzap_instances i on i.id = c.instance_id and i.provider = 'chakra'
    where m.sent_at >= p_de - interval '1 day' and m.sent_at < p_ate + interval '1 day'
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
         case when d.automatica then 'Automático (IA, campanha)' else coalesce(max(p.nome_completo), 'Sem responsável no número') end,
         count(*)::int, count(d.respondida_em)::int,
         round((percentile_cont(0.5) within group (order by extract(epoch from d.respondida_em - d.desde) / 60.0)
                filter (where d.respondida_em is not null))::numeric, 1),
         count(*) filter (where d.respondida_em - d.desde <= interval '10 minutes')::int,
         count(*) filter (where d.respondida_em is null)::int
  from dono d left join profiles p on p.id = d.pessoa_id
  group by d.pessoa_id, d.automatica
  order by d.automatica, 3 desc, 2
$$;
revoke all on function public.atendimento_indicadores_base(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.atendimento_indicadores_base(timestamptz, timestamptz) to service_role;

-- Avisos de conversa sem resposta: a cada 2 min. Desligados (atendimento_config.avisos_ativos = false) e em modo teste
-- até o alinhamento com a Ramone; a edge sai na hora sem fazer nada enquanto estiver desligado.
select cron.unschedule('atendimento-avisos') where exists (select 1 from cron.job where jobname = 'atendimento-avisos');
select cron.schedule('atendimento-avisos', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/alertas-equipe',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"atendimento"}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.atendimento_config where avisos_ativos);
$$);
