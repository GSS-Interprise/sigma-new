-- Torna o estado operacional explicável para a operação.
CREATE OR REPLACE VIEW public.vw_campanha_operational_state AS
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
    count(*) FILTER (WHERE ch.connection_state = 'open' AND ch.status = 'ativo'
      AND coalesce(ch.pode_disparar, false)
      -- Chips antigos/conectados ainda podem não ter sido classificados.
      -- "unknown" não deve bloquear a operação; estados restritos continuam bloqueados.
      AND coalesce(ch.operational_state, 'unknown') IN ('operational', 'unknown'))::integer AS chips_usable,
    count(*) FILTER (WHERE ch.operational_state LIKE 'restricted%')::integer AS chips_restricted
  FROM campaign_chips cc
  LEFT JOIN public.chips ch ON ch.id = cc.chip_id
  GROUP BY cc.campanha_id
),
base AS (
  SELECT
    c.*,
    coalesce(cr.configured_chip_ids, '{}'::uuid[]) AS configured_chip_ids_calc,
    coalesce(cr.chips_configured, 0) AS chips_configured_calc,
    coalesce(cr.chips_connected, 0) AS chips_connected_calc,
    coalesce(cr.chips_usable, 0) AS chips_usable_calc,
    coalesce(cr.chips_restricted, 0) AS chips_restricted_calc,
    ud.ultimo_disparo,
    CASE
      WHEN extract(isodow FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint =
        ANY(coalesce(c.dias_semana, ARRAY[1,2,3,4,5]::smallint[]))
       AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint >= coalesce(c.horario_inicio_brt, 7)
       AND extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo')::smallint < coalesce(c.horario_fim_brt, 17)
      THEN true ELSE false
    END AS dentro_janela_calc
  FROM public.campanhas c
  LEFT JOIN chip_rollup cr ON cr.campanha_id = c.id
  LEFT JOIN public.vw_campanha_ultimo_disparo ud ON ud.campanha_id = c.id
)
SELECT
  id AS campanha_id,
  nome,
  status AS configured_status,
  tipo_envio,
  configured_chip_ids_calc AS configured_chip_ids,
  chips_configured_calc AS chips_configured,
  chips_connected_calc AS chips_connected,
  chips_usable_calc AS chips_usable,
  chips_restricted_calc AS chips_restricted,
  ultimo_disparo,
  CASE
    WHEN status::text IN ('finalizada', 'arquivada') THEN 'finalizada'
    WHEN status::text = 'pausada' THEN 'pausada'
    WHEN status::text IN ('planejada', 'rascunho') THEN 'configurando'
    WHEN chips_configured_calc = 0 THEN 'sem_chip'
    WHEN chips_usable_calc = 0 AND chips_restricted_calc > 0 THEN 'restrita'
    WHEN chips_usable_calc = 0 THEN 'desconectada'
    WHEN tipo_envio = 'manual' THEN 'manual'
    WHEN coalesce(horario_inteligente_ativo, false) AND NOT dentro_janela_calc THEN 'fora_horario'
    WHEN ultimo_disparo >= now() - interval '30 minutes' THEN 'rodando'
    ELSE 'aguardando'
  END AS operational_state,
  CASE
    WHEN status::text IN ('finalizada', 'arquivada') THEN 'Campanha encerrada'
    WHEN status::text = 'pausada' THEN 'Pausada pela operação'
    WHEN status::text IN ('planejada', 'rascunho') THEN 'Configuração ainda não ativada'
    WHEN chips_configured_calc = 0 THEN 'Nenhum chip configurado'
    WHEN chips_usable_calc = 0 AND chips_restricted_calc > 0 THEN 'Todos os chips disponíveis estão restritos'
    WHEN chips_usable_calc = 0 THEN 'Nenhum chip operacional conectado'
    WHEN tipo_envio = 'manual' THEN 'O primeiro contato depende da operadora'
    WHEN coalesce(horario_inteligente_ativo, false) AND NOT dentro_janela_calc THEN 'Fora da janela de envio configurada'
    WHEN ultimo_disparo >= now() - interval '30 minutes' THEN 'Envio observado nos últimos 30 minutos'
    WHEN next_batch_at > now() THEN 'Aguardando a próxima tentativa programada'
    ELSE 'Na janela; aguardando fila, intervalo seguro ou processador'
  END AS operational_reason,
  coalesce(horario_inteligente_ativo, false) AS horario_inteligente_ativo,
  coalesce(horario_inicio_brt, 7) AS horario_inicio_brt,
  coalesce(horario_fim_brt, 17) AS horario_fim_brt,
  coalesce(dias_semana, ARRAY[1,2,3,4,5]::smallint[]) AS dias_semana,
  dentro_janela_calc AS dentro_janela,
  next_batch_at AS proxima_tentativa,
  NULL::integer AS leads_pendentes,
  NULL::integer AS disparos_hoje,
  limite_diario_campanha
FROM base;

GRANT SELECT ON public.vw_campanha_operational_state TO authenticated, service_role;
COMMENT ON VIEW public.vw_campanha_operational_state IS
  'Fonte canônica e explicável do estado operacional, incluindo janela, fila, limite, modalidade e chips.';
