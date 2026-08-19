-- O Chakra usa o mesmo canal oficial de mensagens do Twilio, mas não usa chips
-- Evolution. O estado operacional não pode interpretar a ausência de chips como
-- bloqueio ou desconexão quando o remetente oficial está conectado.

CREATE OR REPLACE VIEW public.vw_campanha_operational_state_v2 AS
WITH campaign_chips AS (
  SELECT DISTINCT c.id AS campanha_id, selected_chip.id AS chip_id
  FROM public.campanhas c
  CROSS JOIN LATERAL unnest(array_remove(array_cat(array_cat(
    coalesce(c.chip_ids, '{}'::uuid[]), ARRAY[c.chip_id]::uuid[]
  ), ARRAY[c.chip_fallback_id]::uuid[]), NULL)) AS selected_chip(id)
),
chip_rollup AS (
  SELECT
    cc.campanha_id,
    array_agg(cc.chip_id ORDER BY cc.chip_id) AS configured_chip_ids,
    count(*)::integer AS chips_configured,
    count(*) FILTER (WHERE ch.connection_state = 'open')::integer AS chips_connected,
    count(*) FILTER (
      WHERE ch.connection_state = 'open'
        AND ch.status = 'ativo'
        AND coalesce(ch.pode_disparar, false)
        AND coalesce(ch.operational_state, 'unknown') IN ('operational', 'unknown')
    )::integer AS chips_usable,
    count(*) FILTER (WHERE ch.operational_state LIKE 'restricted%')::integer AS chips_restricted
  FROM campaign_chips cc
  LEFT JOIN public.chips ch ON ch.id = cc.chip_id
  GROUP BY cc.campanha_id
),
lead_rollup AS (
  SELECT
    cl.campanha_id,
    count(*)::integer AS leads_total,
    count(*) FILTER (WHERE cl.status = 'frio')::integer AS leads_pendentes,
    count(*) FILTER (
      WHERE cl.data_primeiro_contato >=
        date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
    )::integer AS disparos_hoje,
    count(*) FILTER (WHERE cl.data_primeiro_contato >= now() - interval '24 hours')::integer AS disparos_24h
  FROM public.campanha_leads cl
  GROUP BY cl.campanha_id
),
base AS (
  SELECT
    c.*,
    c.status AS configured_status,
    coalesce(cr.configured_chip_ids, '{}'::uuid[]) AS configured_chip_ids_calc,
    coalesce(cr.chips_configured, 0) AS chips_configured_calc,
    coalesce(cr.chips_connected, 0) AS chips_connected_calc,
    coalesce(cr.chips_usable, 0) AS chips_usable_calc,
    coalesce(cr.chips_restricted, 0) AS chips_restricted_calc,
    coalesce(lr.leads_total, 0) AS leads_total_calc,
    coalesce(lr.leads_pendentes, 0) AS leads_pendentes_calc,
    coalesce(lr.disparos_hoje, 0) AS disparos_hoje_calc,
    coalesce(lr.disparos_24h, 0) AS disparos_24h_calc,
    ud.ultimo_disparo,
    (c.whatsapp_provider IN ('twilio', 'chakra') AND c.official_sender_id IS NOT NULL) AS official_sender_configured,
    (c.whatsapp_provider IN ('twilio', 'chakra') AND c.official_template_id IS NOT NULL) AS official_template_configured,
    coalesce(c.limite_diario_campanha, CASE WHEN c.whatsapp_provider IN ('twilio', 'chakra') THEN 250 ELSE 30 END) AS limite_diario_efetivo
  FROM public.campanhas c
  LEFT JOIN chip_rollup cr ON cr.campanha_id = c.id
  LEFT JOIN lead_rollup lr ON lr.campanha_id = c.id
  LEFT JOIN public.vw_campanha_ultimo_disparo ud ON ud.campanha_id = c.id
),
states AS (
  SELECT
    base.*,
    CASE
      WHEN configured_status IN ('finalizada', 'arquivada') THEN 'finalizada'
      WHEN configured_status = 'pausada' THEN 'pausada'
      WHEN configured_status IN ('planejada', 'rascunho') THEN 'configurando'
      WHEN whatsapp_provider IN ('twilio', 'chakra') AND NOT official_sender_configured THEN 'configurando'
      WHEN whatsapp_provider IN ('twilio', 'chakra') AND NOT official_template_configured THEN 'configurando'
      WHEN tipo_envio = 'manual' THEN 'manual'
      WHEN leads_total_calc = 0 OR leads_pendentes_calc = 0 THEN 'sem_leads'
      WHEN coalesce(horario_inteligente_ativo, false)
        AND NOT (
          extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint = ANY(coalesce(dias_semana, ARRAY[1,2,3,4,5]::smallint[]))
          AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint >= coalesce(horario_inicio_brt, 7)
          AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint < coalesce(horario_fim_brt, 17)
        ) THEN 'fora_horario'
      WHEN disparos_hoje_calc >= limite_diario_efetivo THEN 'limite_atingido'
      WHEN ultimo_disparo >= now() - interval '30 minutes' THEN 'rodando'
      WHEN next_batch_at > now() THEN 'aguardando'
      WHEN whatsapp_provider IN ('twilio', 'chakra') THEN 'aguardando'
      WHEN chips_configured_calc = 0 THEN 'sem_chip'
      WHEN chips_usable_calc = 0 AND chips_restricted_calc > 0 THEN 'restrita'
      WHEN chips_usable_calc = 0 THEN 'desconectada'
      ELSE 'aguardando'
    END AS operational_state_calc
  FROM base
)
SELECT
  id AS campanha_id,
  nome,
  status AS configured_status,
  tipo_envio,
  whatsapp_provider,
  configured_chip_ids_calc AS configured_chip_ids,
  chips_configured_calc AS chips_configured,
  chips_connected_calc AS chips_connected,
  chips_usable_calc AS chips_usable,
  chips_restricted_calc AS chips_restricted,
  official_sender_configured,
  official_template_configured,
  leads_total_calc AS leads_total,
  leads_pendentes_calc AS leads_pendentes,
  disparos_hoje_calc AS disparos_hoje,
  disparos_24h_calc AS disparos_24h,
  limite_diario_efetivo AS limite_diario,
  ultimo_disparo,
  operational_state_calc AS operational_state,
  CASE
    WHEN operational_state_calc = 'finalizada' THEN 'Campanha encerrada'
    WHEN operational_state_calc = 'pausada' THEN 'Pausada pela operação'
    WHEN operational_state_calc = 'configurando' AND whatsapp_provider IN ('twilio', 'chakra') AND NOT official_sender_configured THEN 'API oficial sem número remetente configurado'
    WHEN operational_state_calc = 'configurando' AND whatsapp_provider IN ('twilio', 'chakra') THEN 'API oficial sem template aprovado configurado'
    WHEN operational_state_calc = 'configurando' THEN 'Configuração ainda não ativada'
    WHEN operational_state_calc = 'sem_leads' THEN 'Sem leads pendentes na fila'
    WHEN operational_state_calc = 'fora_horario' THEN 'Fora da janela de envio configurada'
    WHEN operational_state_calc = 'limite_atingido' AND whatsapp_provider IN ('twilio', 'chakra') THEN 'Limite diário da API oficial atingido'
    WHEN operational_state_calc = 'limite_atingido' THEN 'Limite diário da campanha atingido'
    WHEN operational_state_calc = 'rodando' AND whatsapp_provider = 'chakra' THEN 'API oficial · Chakra enviando templates'
    WHEN operational_state_calc = 'rodando' AND whatsapp_provider = 'twilio' THEN 'API oficial · Twilio enviando templates'
    WHEN operational_state_calc = 'rodando' THEN 'Evolution enviando pelos chips conectados'
    WHEN operational_state_calc = 'aguardando' AND whatsapp_provider = 'chakra' THEN 'API oficial · Chakra ativa; aguardando o próximo lote'
    WHEN operational_state_calc = 'aguardando' AND whatsapp_provider = 'twilio' THEN 'API oficial · Twilio ativa; aguardando o próximo lote'
    WHEN operational_state_calc = 'sem_chip' THEN 'Nenhum chip Evolution configurado'
    WHEN operational_state_calc = 'restrita' THEN 'Todos os chips Evolution estão restritos'
    WHEN operational_state_calc = 'desconectada' THEN 'Nenhum chip Evolution operacional conectado'
    ELSE 'Campanha ativa; aguardando fila ou intervalo seguro'
  END AS operational_reason,
  coalesce(horario_inteligente_ativo, false) AS horario_inteligente_ativo,
  coalesce(horario_inicio_brt, 7) AS horario_inicio_brt,
  coalesce(horario_fim_brt, 17) AS horario_fim_brt,
  coalesce(dias_semana, ARRAY[1,2,3,4,5]::smallint[]) AS dias_semana,
  next_batch_at AS proxima_tentativa
FROM states;

GRANT SELECT ON public.vw_campanha_operational_state_v2 TO authenticated, service_role;
