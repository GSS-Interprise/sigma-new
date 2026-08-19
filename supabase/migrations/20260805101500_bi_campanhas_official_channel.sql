-- Do not report official WhatsApp campaigns as missing Evolution chips.
CREATE OR REPLACE FUNCTION public.get_bi_acompanhamento_campanhas(p_desde date default null::date)
RETURNS json LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
WITH disp AS (
  SELECT sent_at AS ts,
    CASE WHEN evento_origem IN ('cold_disparo','resposta_ia') THEN 'ia' ELSE 'manual' END AS origem
  FROM chip_send_log
  WHERE sent_at IS NOT NULL
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
    (c.whatsapp_provider = 'twilio' AND c.official_sender_id IS NOT NULL AND c.official_template_id IS NOT NULL) AS canal_configurado,
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
    CASE WHEN cp.whatsapp_provider = 'twilio' THEN 0 ELSE coalesce(array_length(cp.chips_arr,1),0) END chips_total,
    CASE WHEN cp.whatsapp_provider = 'twilio' THEN 0
      ELSE (select count(*) from chips ch where ch.id = any(cp.chips_arr) and ch.connection_state = 'open')
    END chips_online
  FROM camp cp LEFT JOIN funil f ON f.campanha_id = cp.id
)
SELECT json_build_object(
  'hoje', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where ts::date = current_date),
  'periodo', (select json_build_object('ia', count(*) filter(where origem='ia'), 'manual', count(*) filter(where origem='manual'), 'total', count(*)) from disp where (p_desde is null or ts::date >= p_desde)),
  'resumo', (select json_build_object(
     'ativas', count(*) filter(where status='ativa'),
     'pausadas', count(*) filter(where status='pausada'),
     'rodando_hoje', count(*) filter(where status='ativa' and disparos_hoje > 0),
     'paradas', count(*) filter(where status='ativa' and (ultimo_disparo is null or ultimo_disparo < now() - interval '2 days')),
     'sem_chip_online', count(*) filter(where status='ativa' and whatsapp_provider <> 'twilio' and chips_online = 0)
   ) from linhas),
  'por_dia', coalesce((select json_agg(x order by x.dia) from (
     select ts::date dia, count(*) filter(where origem='ia') ia, count(*) filter(where origem='manual') manual, count(*) total
     from disp where (p_desde is null or ts::date >= p_desde) group by ts::date) x), '[]'),
  'campanhas', coalesce((select json_agg(l order by l.disparos_hoje desc, l.disparos_7d desc, l.disparos_total desc) from linhas l), '[]')
);
$function$;
