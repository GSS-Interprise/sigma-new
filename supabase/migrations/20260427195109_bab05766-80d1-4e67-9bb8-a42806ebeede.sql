CREATE OR REPLACE VIEW public.vw_worklist_pendencias_setor AS
-- ============= PROSPECÇÃO E CAPTAÇÃO =============
-- 1 pendência por canal/linha, agregando leads com status_final='aberto'
-- na tabela campanha_proposta_lead_canais que estão parados há 4+ dias.
SELECT
  ('lead-canal-' || cplc.canal)::text AS id,
  '6dfff5fe-e51c-4258-95d0-cdc84b179985'::uuid AS setor_id,
  'lead'::text AS origem,
  gen_random_uuid() AS recurso_id,
  ('Leads em aberto · ' || INITCAP(cplc.canal)) AS titulo,
  (count(*)::text || ' leads em aberto há 4+ dias na linha ' || cplc.canal) AS descricao,
  CASE
    WHEN count(*) FILTER (WHERE cplc.entrou_em < now() - interval '14 days') > 0 THEN 'alta'
    WHEN count(*) FILTER (WHERE cplc.entrou_em < now() - interval '7 days') > 0 THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  min(cplc.entrou_em) AS referencia_data,
  '/disparos/acompanhamento'::text AS link
FROM campanha_proposta_lead_canais cplc
WHERE cplc.status_final = 'aberto'
  AND cplc.entrou_em < now() - interval '4 days'
GROUP BY cplc.canal
HAVING count(*) > 0

UNION ALL
-- ============= CONTRATOS (inalterado) =============
SELECT
  'contrato-' || c.id::text AS id,
  '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
  'contrato'::text AS origem,
  c.id AS recurso_id,
  COALESCE(c.codigo_contrato, 'Contrato sem código') AS titulo,
  'Vence em ' || c.data_fim::text AS descricao,
  CASE
    WHEN c.data_fim < (CURRENT_DATE + interval '15 days') THEN 'alta'
    WHEN c.data_fim < (CURRENT_DATE + interval '45 days') THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  c.data_fim::timestamp with time zone AS referencia_data,
  '/contratos'::text AS link
FROM contratos c
WHERE c.data_fim >= CURRENT_DATE
  AND c.data_fim <= (CURRENT_DATE + interval '90 days')
  AND COALESCE(c.status_contrato, '') <> ALL (ARRAY['encerrado', 'cancelado'])

UNION ALL
-- ============= LICITAÇÕES (inalterado) =============
SELECT
  'licitacao-' || li.id::text AS id,
  'ee54a8a5-47b1-4059-881a-381b9f5b82f1'::uuid AS setor_id,
  'licitacao'::text AS origem,
  li.id AS recurso_id,
  COALESCE(li.titulo, li.numero_edital, 'Licitação') AS titulo,
  'Limite em ' || li.data_limite::text AS descricao,
  CASE
    WHEN li.data_limite < (now() + interval '3 days') THEN 'alta'
    WHEN li.data_limite < (now() + interval '7 days') THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  li.data_limite::timestamp with time zone AS referencia_data,
  '/licitacoes'::text AS link
FROM licitacoes li
WHERE li.data_limite >= CURRENT_DATE
  AND li.data_limite <= (CURRENT_DATE + interval '14 days')
  AND li.status <> ALL (ARRAY[
    'descarte_edital'::status_licitacao,
    'suspenso_revogado'::status_licitacao,
    'nao_ganhamos'::status_licitacao,
    'adjudicacao_homologacao'::status_licitacao,
    'arrematados'::status_licitacao
  ]);