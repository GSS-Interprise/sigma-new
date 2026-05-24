-- Adiciona especialidade_id na view vw_campanhas_dashboard pra viabilizar
-- filtro "Especialidade" no Dashboard (F3.1).
--
-- Postgres não permite reordenar colunas em CREATE OR REPLACE VIEW, então
-- a nova coluna entra no final.

CREATE OR REPLACE VIEW public.vw_campanhas_dashboard AS
WITH leads_agg AS (
  SELECT cl.campanha_id,
    count(*) AS pool_total,
    count(*) FILTER (WHERE cl.status = 'frio'::status_lead_campanha) AS pool_pendentes,
    count(*) FILTER (WHERE cl.status = 'contatado'::status_lead_campanha) AS contatado,
    count(*) FILTER (WHERE cl.status = 'em_conversa'::status_lead_campanha) AS em_conversa,
    count(*) FILTER (WHERE cl.status = 'aquecido'::status_lead_campanha) AS aquecido,
    count(*) FILTER (WHERE cl.status = 'quente'::status_lead_campanha) AS quentes,
    count(*) FILTER (WHERE cl.status = 'convertido'::status_lead_campanha) AS convertidos,
    count(*) FILTER (WHERE cl.data_primeiro_contato > (now() - '24:00:00'::interval)) AS disparos_24h,
    count(*) FILTER (WHERE cl.data_primeiro_contato > (now() - '7 days'::interval)) AS disparos_7d,
    count(*) FILTER (WHERE cl.data_primeiro_contato::date = CURRENT_DATE) AS disparos_hoje,
    count(*) FILTER (WHERE cl.data_primeiro_contato::date = (CURRENT_DATE - 1)) AS disparos_ontem,
    max(EXTRACT(epoch FROM now() - cl.data_status) / 3600::numeric) FILTER (WHERE cl.status = 'quente'::status_lead_campanha AND COALESCE(cl.humano_assumiu, false) = false) AS quente_mais_antigo_h
  FROM campanha_leads cl
  GROUP BY cl.campanha_id
), chip_main AS (
  SELECT c_1.id AS campanha_id, ch.id AS chip_id, ch.nome AS chip_nome, ch.connection_state AS chip_conn,
    ch.pode_disparar AS chip_pode_disparar, cs.fase AS chip_fase, cs.health_score AS chip_health,
    cs.paused_until AS chip_pausado_ate, cs.pause_reason AS chip_pause_motivo,
    cs.aquecedor_ativo AS chip_aquecedor_ativo, chip_warmup_limit(ch.id) AS chip_limite_dia,
    chip_window_count(ch.id, '24:00:00'::interval, NULL::text) AS chip_envios_24h
  FROM campanhas c_1
    LEFT JOIN chips ch ON ch.id = COALESCE(c_1.chip_id, c_1.chip_ids[1])
    LEFT JOIN chip_state cs ON cs.chip_id = ch.id
  WHERE c_1.tipo_campanha = 'prospeccao'::text AND (c_1.status = ANY (ARRAY['ativa'::status_campanha, 'pausada'::status_campanha]))
)
SELECT c.id AS campanha_id, c.nome, c.status, c.tipo_campanha, c.regiao_estado,
  c.limite_diario_campanha, c.created_at, c.updated_at, c.next_batch_at,
  EXTRACT(day FROM now() - c.created_at)::integer AS dias_no_ar,
  COALESCE(l.pool_total, 0::bigint) AS pool_total,
  COALESCE(l.pool_pendentes, 0::bigint) AS pool_pendentes,
  COALESCE(l.contatado, 0::bigint) AS contatado,
  COALESCE(l.em_conversa, 0::bigint) AS em_conversa,
  COALESCE(l.aquecido, 0::bigint) AS aquecido,
  COALESCE(l.quentes, 0::bigint) AS quentes,
  COALESCE(l.convertidos, 0::bigint) AS convertidos,
  c.disparos_enviados AS total_disparos, c.disparos_falhas AS total_falhas,
  CASE WHEN c.disparos_enviados > 0 THEN round(c.total_contatado::numeric / c.disparos_enviados::numeric * 100::numeric, 0) ELSE 0::numeric END AS taxa_contato_pct,
  COALESCE(l.disparos_hoje, 0::bigint) AS disparos_hoje,
  COALESCE(l.disparos_ontem, 0::bigint) AS disparos_ontem,
  COALESCE(l.disparos_24h, 0::bigint) AS disparos_24h,
  COALESCE(l.disparos_7d, 0::bigint) AS disparos_7d,
  round(l.quente_mais_antigo_h, 1) AS quente_mais_antigo_h,
  cm.chip_id AS chip_principal_id, cm.chip_nome AS chip_principal,
  cm.chip_conn AS chip_conexao, cm.chip_pode_disparar, cm.chip_fase, cm.chip_health,
  cm.chip_pausado_ate, cm.chip_pause_motivo, cm.chip_aquecedor_ativo,
  cm.chip_limite_dia, cm.chip_envios_24h,
  cm.chip_limite_dia - cm.chip_envios_24h AS chip_capacidade_restante,
  c.especialidade_id
FROM campanhas c
  LEFT JOIN leads_agg l ON l.campanha_id = c.id
  LEFT JOIN chip_main cm ON cm.campanha_id = c.id
WHERE c.tipo_campanha = 'prospeccao'::text AND (c.status = ANY (ARRAY['ativa'::status_campanha, 'pausada'::status_campanha]))
ORDER BY c.disparos_enviados DESC, c.created_at DESC;
