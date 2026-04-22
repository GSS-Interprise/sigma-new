DROP VIEW IF EXISTS public.vw_lead_status_por_proposta;

CREATE VIEW public.vw_lead_status_por_proposta AS
WITH cascata AS (
  SELECT cplc.campanha_proposta_id,
    cplc.lead_id,
    bool_or(cplc.status_final = 'aberto'::text) AS tem_aberto,
    bool_or(cplc.status_final = ANY (ARRAY['respondeu'::text, 'convertido'::text, 'descartado'::text, 'fechado'::text])) AS tem_fechado,
    bool_or(cplc.status_final = 'transferido'::text) AS tem_transferido,
    max(cplc.saiu_em) FILTER (WHERE cplc.status_final <> 'aberto'::text) AS ultima_decisao_em,
    (array_agg(cplc.motivo_saida ORDER BY cplc.saiu_em DESC NULLS LAST) FILTER (WHERE cplc.motivo_saida IS NOT NULL))[1] AS ultimo_motivo
  FROM campanha_proposta_lead_canais cplc
  GROUP BY cplc.campanha_proposta_id, cplc.lead_id
), liberacoes AS (
  SELECT lead_liberacoes.lead_id,
    lead_liberacoes.campanha_proposta_id,
    max(lead_liberacoes.created_at) AS ultima_liberacao
  FROM lead_liberacoes
  GROUP BY lead_liberacoes.lead_id, lead_liberacoes.campanha_proposta_id
), ultimo_contato_lead AS (
  SELECT l.id AS lead_id,
    max(dhc.ultimo_disparo) AS ultimo_disparo
  FROM leads l
    JOIN disparos_historico_contatos dhc ON l.phone_e164 IS NOT NULL AND dhc.telefone = l.phone_e164 OR l.email IS NOT NULL AND dhc.email IS NOT NULL AND lower(dhc.email) = lower(l.email)
  GROUP BY l.id
)
SELECT c.campanha_proposta_id,
  c.lead_id,
  CASE
    WHEN c.tem_fechado AND COALESCE(lib.ultima_liberacao, '1970-01-01 00:00:00+00'::timestamp with time zone) <= COALESCE(c.ultima_decisao_em, '1970-01-01 00:00:00+00'::timestamp with time zone) AND NOT c.tem_aberto THEN 'fechado_proposta'::text
    WHEN c.tem_aberto OR c.tem_transferido OR uc.ultimo_disparo IS NOT NULL THEN 'contactado'::text
    ELSE 'a_contactar'::text
  END AS status_proposta,
  COALESCE(c.tem_aberto, false) AS tem_raia_aberta,
  c.ultima_decisao_em,
  c.ultimo_motivo,
  (EXISTS ( SELECT 1
    FROM blacklist bl
      JOIN leads l ON l.phone_e164 = bl.phone_e164
    WHERE l.id = c.lead_id)) AS bloqueado_blacklist,
  (EXISTS ( SELECT 1
    FROM leads_bloqueio_temporario lbt
    WHERE lbt.lead_id = c.lead_id AND lbt.removed_at IS NULL)) AS bloqueado_temp,
  CASE
    WHEN uc.ultimo_disparo IS NOT NULL AND uc.ultimo_disparo >= (now() - '7 days'::interval) AND COALESCE(lib.ultima_liberacao, '1970-01-01 00:00:00+00'::timestamp with time zone) < uc.ultimo_disparo THEN true
    ELSE false
  END AS bloqueado_janela_7d,
  uc.ultimo_disparo
FROM cascata c
  LEFT JOIN liberacoes lib ON lib.lead_id = c.lead_id AND lib.campanha_proposta_id = c.campanha_proposta_id
  LEFT JOIN ultimo_contato_lead uc ON uc.lead_id = c.lead_id
UNION ALL
SELECT cp.id AS campanha_proposta_id,
  dli.lead_id,
  CASE WHEN uc.ultimo_disparo IS NOT NULL THEN 'contactado'::text ELSE 'a_contactar'::text END AS status_proposta,
  false AS tem_raia_aberta,
  NULL::timestamp with time zone AS ultima_decisao_em,
  NULL::text AS ultimo_motivo,
  (EXISTS ( SELECT 1
    FROM blacklist bl
      JOIN leads l ON l.phone_e164 = bl.phone_e164
    WHERE l.id = dli.lead_id)) AS bloqueado_blacklist,
  (EXISTS ( SELECT 1
    FROM leads_bloqueio_temporario lbt
    WHERE lbt.lead_id = dli.lead_id AND lbt.removed_at IS NULL)) AS bloqueado_temp,
  CASE
    WHEN uc.ultimo_disparo IS NOT NULL AND uc.ultimo_disparo >= (now() - '7 days'::interval) AND COALESCE(lib.ultima_liberacao, '1970-01-01 00:00:00+00'::timestamp with time zone) < uc.ultimo_disparo THEN true
    ELSE false
  END AS bloqueado_janela_7d,
  uc.ultimo_disparo
FROM campanha_propostas cp
  JOIN disparo_lista_itens dli ON dli.lista_id = cp.lista_id
  LEFT JOIN liberacoes lib ON lib.lead_id = dli.lead_id AND lib.campanha_proposta_id = cp.id
  LEFT JOIN ultimo_contato_lead uc ON uc.lead_id = dli.lead_id
WHERE cp.lista_id IS NOT NULL AND NOT (EXISTS ( SELECT 1
  FROM campanha_proposta_lead_canais x
  WHERE x.campanha_proposta_id = cp.id AND x.lead_id = dli.lead_id));