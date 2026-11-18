-- Zenvia junto do BI de campanhas (Raul, 18/11: "o pessoal queria ver por campanha, e aí o Zenvia poderia ser uma
-- campanha"). zenvia_dia junta o que o webhook grava (zenvia_resumo_dia, com médico a médico) e o histórico só em totais
-- da API (zenvia_relatorio_dia), preferindo o webhook no dia em que ele tem dado.
-- A Zenvia entra como uma linha a mais em get_bi_acompanhamento_campanhas, sem gravar nada em campanhas/campanha_leads:
-- os gatilhos de campanha_leads criam tarefas e avisos para a equipe.

create or replace view public.zenvia_dia as
with hist as (
  select dia,
         sum(saida) filter (where tipo = 'notification') as disparos,
         sum(entrada) filter (where tipo = 'message') as mensagens_recebidas
    from public.zenvia_relatorio_dia
   where canal = 'whatsapp'
   group by dia
),
wh as (
  select r.dia, r.disparos, r.responderam,
         (select count(*) from public.zenvia_eventos e
           where e.tipo = 'MESSAGE' and e.direcao = 'IN'
             and (e.evento_em at time zone 'America/Sao_Paulo')::date = r.dia) as mensagens_recebidas
    from public.zenvia_resumo_dia r
)
select coalesce(w.dia, h.dia) as dia,
       coalesce(nullif(w.disparos, 0), h.disparos, 0)::int as disparos,
       coalesce(w.responderam, 0)::int as responderam,      -- médicos distintos; só existe com o webhook
       coalesce(nullif(w.mensagens_recebidas, 0), h.mensagens_recebidas, 0)::int as mensagens_recebidas,
       case when w.dia is not null and w.disparos > 0 then 'webhook' else 'relatorio' end as fonte
  from wh w full join hist h on h.dia = w.dia;

grant select on public.zenvia_dia to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_bi_acompanhamento_campanhas(p_desde date DEFAULT NULL::date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH disp AS (
  -- Evolution: registro histórico do envio do chip.
  SELECT sent_at AS ts,
    CASE WHEN evento_origem IN ('cold_disparo','resposta_ia') THEN 'ia' ELSE 'manual' END AS origem
  FROM chip_send_log
  WHERE sent_at IS NOT NULL

  UNION ALL

  -- Oficial (Twilio/Chakra): mensagem efetivamente criada no Sigma.
  SELECT sm.sent_at AS ts,
    CASE WHEN sm.sent_by_user_id IS NULL THEN 'ia' ELSE 'manual' END AS origem
  FROM sigzap_messages sm
  WHERE sm.from_me = true
    AND sm.provider IN ('twilio', 'chakra')
    AND sm.sent_at IS NOT NULL
),
funil AS (
  SELECT campanha_id,
    count(*) leads,
    count(*) FILTER (WHERE status = 'frio') frio,
    count(*) FILTER (WHERE status <> 'frio') contatados,
    count(*) FILTER (WHERE status = 'em_conversa') em_conversa,
    count(*) FILTER (WHERE status = 'quente') quente,
    count(*) FILTER (WHERE status = 'convertido') convertido,
    max(data_ultimo_contato) ultima_atividade,
    count(*) FILTER (WHERE data_ultimo_contato::date = current_date) contatados_hoje,
    count(*) FILTER (WHERE data_ultimo_contato >= now() - interval '7 days') contatados_7d
  FROM campanha_leads GROUP BY campanha_id
),
camp AS (
  SELECT c.id, c.nome, c.tipo_envio, c.status,
    c.whatsapp_provider,
    (c.whatsapp_provider IN ('twilio', 'chakra')
      AND c.official_sender_id IS NOT NULL
      AND c.official_template_id IS NOT NULL) AS canal_configurado,
    coalesce(c.chip_ids, CASE WHEN c.chip_id IS NOT NULL THEN array[c.chip_id] ELSE '{}'::uuid[] END) chips_arr
  FROM campanhas c WHERE c.status IN ('ativa','pausada')
),
linhas AS (
  SELECT cp.id campanha_id, cp.nome campanha, cp.tipo_envio tipo, cp.status,
    cp.whatsapp_provider, cp.canal_configurado,
    coalesce(f.contatados_hoje,0) disparos_hoje,
    coalesce(f.contatados_7d,0) disparos_7d,
    coalesce(f.contatados,0) disparos_total,
    f.ultima_atividade ultimo_disparo,
    coalesce(f.leads,0) leads, coalesce(f.frio,0) frio, coalesce(f.contatados,0) contatados,
    coalesce(f.em_conversa,0) em_conversa, coalesce(f.quente,0) quente, coalesce(f.convertido,0) convertido,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0 ELSE coalesce(array_length(cp.chips_arr,1),0) END chips_total,
    CASE WHEN cp.whatsapp_provider IN ('twilio', 'chakra') THEN 0
      ELSE (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open')
    END chips_online
  FROM camp cp LEFT JOIN funil f ON f.campanha_id = cp.id

  UNION ALL

  -- Zenvia como uma campanha a mais (Raul, 18/11): disparos e respostas vêm de zenvia_dia (webhook + histórico da API).
  -- Sem chip e sem funil de leads no Sigma: "contatados" = disparos, "em conversa" = médicos que responderam.
  SELECT '00000000-0000-4000-8000-00000000ce01'::uuid, 'Zenvia · WhatsApp', 'manual', 'ativa'::status_campanha,
    'zenvia', true,
    coalesce(sum(z.disparos) filter (where z.dia = (now() at time zone 'America/Sao_Paulo')::date), 0)::int,
    coalesce(sum(z.disparos) filter (where z.dia >= (now() at time zone 'America/Sao_Paulo')::date - 6), 0)::int,
    coalesce(sum(z.disparos), 0)::int,
    -- Último disparo: o evento mais recente do webhook ou, no histórico, o meio-dia do último dia com disparo.
    coalesce((select max(e.evento_em) from zenvia_eventos e where e.tipo = 'MESSAGE_STATUS'),
             ((max(z.dia) filter (where z.disparos > 0))::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo'),
    coalesce(sum(z.disparos), 0)::int, 0, coalesce(sum(z.disparos), 0)::int,
    coalesce(sum(z.responderam), 0)::int, 0, 0, 0, 0
  FROM zenvia_dia z
  WHERE exists (select 1 from zenvia_dia)
)
SELECT json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'periodo', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where (p_desde is null or ts::date >= p_desde)),
  -- Zenvia à parte (não entra em ia/manual nem no gráfico por dia, que são dos envios do próprio Sigma).
  'zenvia', (select json_build_object('disparos', coalesce(sum(disparos),0), 'responderam', coalesce(sum(responderam),0), 'mensagens_recebidas', coalesce(sum(mensagens_recebidas),0)) from zenvia_dia where (p_desde is null or dia >= p_desde)),
  'resumo', (select json_build_object(
     'ativas', count(*) filter(where status='ativa'),
     'pausadas', count(*) filter(where status='pausada'),
     'rodando_hoje', count(*) filter(where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter(where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter(where status='ativa' and (whatsapp_provider is null or whatsapp_provider = 'evolution') and chips_online = 0)
   ) from linhas),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter(where origem='ia') ia, count(*) filter(where origem='manual') manual, count(*) total
     from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$function$;
