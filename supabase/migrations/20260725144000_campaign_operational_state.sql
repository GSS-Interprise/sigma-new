-- Fonte única do estado que a operação enxerga.
CREATE OR REPLACE VIEW public.vw_campanha_operational_state AS
WITH campaign_chips AS (
  SELECT DISTINCT
    c.id AS campanha_id,
    selected_chip.id AS chip_id
  FROM public.campanhas c
  CROSS JOIN LATERAL unnest(
    array_remove(
      array_cat(
        array_cat(
          coalesce(c.chip_ids, '{}'::uuid[]),
          ARRAY[c.chip_id]::uuid[]
        ),
        ARRAY[c.chip_fallback_id]::uuid[]
      ),
      NULL
    )
  ) AS selected_chip(id)
),
chip_rollup AS (
  SELECT
    cc.campanha_id,
    array_agg(cc.chip_id ORDER BY cc.chip_id) AS configured_chip_ids,
    count(*)::integer AS chips_configured,
    count(*) FILTER (
      WHERE ch.connection_state = 'open'
    )::integer AS chips_connected,
    count(*) FILTER (
      WHERE ch.connection_state = 'open'
        AND ch.status = 'ativo'
        AND coalesce(ch.pode_disparar, false)
        AND ch.operational_state = 'operational'
    )::integer AS chips_usable,
    count(*) FILTER (
      WHERE ch.operational_state LIKE 'restricted%'
    )::integer AS chips_restricted
  FROM campaign_chips cc
  LEFT JOIN public.chips ch ON ch.id = cc.chip_id
  GROUP BY cc.campanha_id
)
SELECT
  c.id AS campanha_id,
  c.nome,
  c.status AS configured_status,
  c.tipo_envio,
  coalesce(cr.configured_chip_ids, '{}'::uuid[]) AS configured_chip_ids,
  coalesce(cr.chips_configured, 0) AS chips_configured,
  coalesce(cr.chips_connected, 0) AS chips_connected,
  coalesce(cr.chips_usable, 0) AS chips_usable,
  coalesce(cr.chips_restricted, 0) AS chips_restricted,
  ud.ultimo_disparo,
  CASE
    WHEN c.status::text IN ('finalizada', 'arquivada') THEN 'finalizada'
    WHEN c.status::text = 'pausada' THEN 'pausada'
    WHEN c.status::text = 'planejada' THEN 'configurando'
    WHEN coalesce(cr.chips_configured, 0) = 0 THEN 'sem_chip'
    WHEN coalesce(cr.chips_usable, 0) = 0
      AND coalesce(cr.chips_restricted, 0) > 0 THEN 'restrita'
    WHEN coalesce(cr.chips_usable, 0) = 0 THEN 'desconectada'
    WHEN ud.ultimo_disparo >= now() - interval '30 minutes' THEN 'rodando'
    ELSE 'pronta'
  END AS operational_state,
  CASE
    WHEN c.status::text IN ('finalizada', 'arquivada') THEN 'Campanha encerrada'
    WHEN c.status::text = 'pausada' THEN 'Pausada pela operação'
    WHEN c.status::text = 'planejada' THEN 'Configuração ainda não ativada'
    WHEN coalesce(cr.chips_configured, 0) = 0 THEN 'Nenhum chip configurado'
    WHEN coalesce(cr.chips_usable, 0) = 0
      AND coalesce(cr.chips_restricted, 0) > 0 THEN 'Todos os chips disponíveis estão restritos'
    WHEN coalesce(cr.chips_usable, 0) = 0 THEN 'Nenhum chip operacional conectado'
    WHEN ud.ultimo_disparo >= now() - interval '30 minutes' THEN 'Disparo observado nos últimos 30 minutos'
    ELSE 'Configuração válida; aguardando próximo envio'
  END AS operational_reason
FROM public.campanhas c
LEFT JOIN chip_rollup cr ON cr.campanha_id = c.id
LEFT JOIN public.vw_campanha_ultimo_disparo ud ON ud.campanha_id = c.id;

GRANT SELECT ON public.vw_campanha_operational_state
  TO authenticated, service_role;

COMMENT ON VIEW public.vw_campanha_operational_state IS
  'Fonte canônica do estado operacional: configurando, pronta, rodando, pausada, sem_chip, restrita, desconectada ou finalizada.';
