-- =====================================================================
-- vw_campanhas_dashboard
-- View agregada com 1 row por campanha ativa/pausada, somando: pool de
-- leads por estado, disparos hoje/ontem/24h/7d, taxa de contato, lead
-- quente mais antigo aguardando atendimento, e saúde do chip principal.
--
-- Uso: SELECT * FROM vw_campanhas_dashboard ORDER BY total_disparos DESC;
-- Frontend futuro: página /campanhas/monitor consome essa view.
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_campanhas_dashboard AS
WITH leads_agg AS (
  SELECT
    cl.campanha_id,
    COUNT(*)                                                                       AS pool_total,
    COUNT(*) FILTER (WHERE cl.status = 'frio')                                     AS pool_pendentes,
    COUNT(*) FILTER (WHERE cl.status = 'contatado')                                AS contatado,
    COUNT(*) FILTER (WHERE cl.status = 'em_conversa')                              AS em_conversa,
    COUNT(*) FILTER (WHERE cl.status = 'aquecido')                                 AS aquecido,
    COUNT(*) FILTER (WHERE cl.status = 'quente')                                   AS quentes,
    COUNT(*) FILTER (WHERE cl.status = 'convertido')                               AS convertidos,
    COUNT(*) FILTER (WHERE cl.data_primeiro_contato > NOW() - INTERVAL '24 hours') AS disparos_24h,
    COUNT(*) FILTER (WHERE cl.data_primeiro_contato > NOW() - INTERVAL '7 days')   AS disparos_7d,
    COUNT(*) FILTER (WHERE cl.data_primeiro_contato::date = CURRENT_DATE)          AS disparos_hoje,
    COUNT(*) FILTER (WHERE cl.data_primeiro_contato::date = CURRENT_DATE - 1)      AS disparos_ontem,
    MAX(EXTRACT(EPOCH FROM (NOW() - cl.data_status)) / 3600)
      FILTER (WHERE cl.status = 'quente' AND COALESCE(cl.humano_assumiu, false) = false) AS quente_mais_antigo_h
  FROM public.campanha_leads cl
  GROUP BY cl.campanha_id
),
chip_main AS (
  SELECT
    c.id AS campanha_id,
    ch.id AS chip_id,
    ch.nome AS chip_nome,
    ch.connection_state AS chip_conn,
    ch.pode_disparar AS chip_pode_disparar,
    cs.fase AS chip_fase,
    cs.health_score AS chip_health,
    cs.paused_until AS chip_pausado_ate,
    cs.pause_reason AS chip_pause_motivo,
    cs.aquecedor_ativo AS chip_aquecedor_ativo,
    public.chip_warmup_limit(ch.id) AS chip_limite_dia,
    public.chip_window_count(ch.id, INTERVAL '24 hours', NULL) AS chip_envios_24h
  FROM public.campanhas c
  LEFT JOIN public.chips ch
    ON ch.id = COALESCE(c.chip_id, (c.chip_ids)[1])
  LEFT JOIN public.chip_state cs ON cs.chip_id = ch.id
  WHERE c.tipo_campanha = 'prospeccao'
    AND c.status IN ('ativa', 'pausada')
)
SELECT
  c.id                                                                AS campanha_id,
  c.nome,
  c.status,
  c.tipo_campanha,
  c.regiao_estado,
  c.limite_diario_campanha,
  c.created_at,
  c.updated_at,
  c.next_batch_at,
  EXTRACT(DAY FROM NOW() - c.created_at)::int                         AS dias_no_ar,

  COALESCE(l.pool_total, 0)                                           AS pool_total,
  COALESCE(l.pool_pendentes, 0)                                       AS pool_pendentes,
  COALESCE(l.contatado, 0)                                            AS contatado,
  COALESCE(l.em_conversa, 0)                                          AS em_conversa,
  COALESCE(l.aquecido, 0)                                             AS aquecido,
  COALESCE(l.quentes, 0)                                              AS quentes,
  COALESCE(l.convertidos, 0)                                          AS convertidos,

  c.disparos_enviados                                                 AS total_disparos,
  c.disparos_falhas                                                   AS total_falhas,
  CASE
    WHEN c.disparos_enviados > 0
    THEN ROUND((c.total_contatado::numeric / c.disparos_enviados::numeric) * 100, 0)
    ELSE 0
  END                                                                 AS taxa_contato_pct,

  COALESCE(l.disparos_hoje, 0)                                        AS disparos_hoje,
  COALESCE(l.disparos_ontem, 0)                                       AS disparos_ontem,
  COALESCE(l.disparos_24h, 0)                                         AS disparos_24h,
  COALESCE(l.disparos_7d, 0)                                          AS disparos_7d,

  ROUND(l.quente_mais_antigo_h::numeric, 1)                           AS quente_mais_antigo_h,

  cm.chip_id                                                          AS chip_principal_id,
  cm.chip_nome                                                        AS chip_principal,
  cm.chip_conn                                                        AS chip_conexao,
  cm.chip_pode_disparar                                               AS chip_pode_disparar,
  cm.chip_fase                                                        AS chip_fase,
  cm.chip_health                                                      AS chip_health,
  cm.chip_pausado_ate                                                 AS chip_pausado_ate,
  cm.chip_pause_motivo                                                AS chip_pause_motivo,
  cm.chip_aquecedor_ativo                                             AS chip_aquecedor_ativo,
  cm.chip_limite_dia                                                  AS chip_limite_dia,
  cm.chip_envios_24h                                                  AS chip_envios_24h,
  (cm.chip_limite_dia - cm.chip_envios_24h)                           AS chip_capacidade_restante
FROM public.campanhas c
LEFT JOIN leads_agg l ON l.campanha_id = c.id
LEFT JOIN chip_main cm ON cm.campanha_id = c.id
WHERE c.tipo_campanha = 'prospeccao'
  AND c.status IN ('ativa', 'pausada')
ORDER BY c.disparos_enviados DESC, c.created_at DESC;

COMMENT ON VIEW public.vw_campanhas_dashboard IS
  'Agregação por campanha ativa/pausada: pool por status, disparos hoje/ontem/24h/7d, taxa de contato, quente mais antigo aguardando, saúde do chip principal. Usada por monitor manual e (futuro) página /campanhas/monitor.';
