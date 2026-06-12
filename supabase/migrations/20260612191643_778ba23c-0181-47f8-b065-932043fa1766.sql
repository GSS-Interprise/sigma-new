
DROP VIEW IF EXISTS public.vw_worklist_pendencias_setor;
DROP MATERIALIZED VIEW IF EXISTS public.vw_worklist_pendencias_setor;

CREATE MATERIALIZED VIEW public.vw_worklist_pendencias_setor AS
SELECT
  ('lead-canal-' || cplc.canal) AS id,
  '6dfff5fe-e51c-4258-95d0-cdc84b179985'::uuid AS setor_id,
  'lead'::text AS origem,
  gen_random_uuid() AS recurso_id,
  ('Leads em aberto · ' || initcap(cplc.canal)) AS titulo,
  (count(*)::text || ' leads em aberto há 4+ dias na linha ' || cplc.canal) AS descricao,
  CASE
    WHEN count(*) FILTER (WHERE cplc.entrou_em < now() - interval '14 days') > 0 THEN 'alta'
    WHEN count(*) FILTER (WHERE cplc.entrou_em < now() - interval '7 days')  > 0 THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  min(cplc.entrou_em) AS referencia_data,
  '/disparos/acompanhamento'::text AS link
FROM public.campanha_proposta_lead_canais cplc
WHERE cplc.status_final = 'aberto' AND cplc.entrou_em < now() - interval '4 days'
GROUP BY cplc.canal
HAVING count(*) > 0

UNION ALL

SELECT
  ('contrato-' || c.id::text) AS id,
  '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
  'contrato'::text AS origem,
  c.id AS recurso_id,
  COALESCE(c.codigo_contrato, 'Contrato sem código') AS titulo,
  ('Vence em ' || to_char(c.data_fim, 'DD/MM/YYYY')) AS descricao,
  CASE
    WHEN c.data_fim < CURRENT_DATE THEN 'alta'
    WHEN c.data_fim < CURRENT_DATE + (GREATEST(COALESCE(c.dias_aviso_vencimento,60)/3,1)) * interval '1 day' THEN 'alta'
    WHEN c.data_fim < CURRENT_DATE + (GREATEST(COALESCE(c.dias_aviso_vencimento,60)*2/3,1)) * interval '1 day' THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  c.data_fim::timestamptz AS referencia_data,
  '/contratos'::text AS link
FROM public.contratos c
WHERE c.data_fim IS NOT NULL
  AND c.data_fim <= CURRENT_DATE + COALESCE(c.dias_aviso_vencimento,60) * interval '1 day'
  AND COALESCE(c.status_contrato,'') NOT IN ('encerrado','cancelado')

UNION ALL

SELECT
  ('medico-doc-' || md.id::text) AS id,
  '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
  'contrato'::text AS origem,
  md.id AS recurso_id,
  ('Documento: ' || COALESCE(md.arquivo_nome, md.tipo_documento::text, 'Documento')) AS titulo,
  ('Validade em ' || to_char(md.data_validade,'DD/MM/YYYY')) AS descricao,
  CASE
    WHEN md.data_validade < CURRENT_DATE THEN 'alta'
    WHEN md.data_validade < CURRENT_DATE + interval '10 days' THEN 'alta'
    WHEN md.data_validade < CURRENT_DATE + interval '20 days' THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  md.data_validade::timestamptz AS referencia_data,
  '/medicos'::text AS link
FROM public.medico_documentos md
WHERE md.data_validade IS NOT NULL
  AND md.data_validade <= CURRENT_DATE + interval '30 days'

UNION ALL

SELECT
  ('ages-prof-doc-' || apd.id::text) AS id,
  '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
  'contrato'::text AS origem,
  apd.id AS recurso_id,
  ('Documento: ' || COALESCE(apd.arquivo_nome, apd.tipo_documento::text,'Documento')) AS titulo,
  ('Validade em ' || to_char(apd.data_validade,'DD/MM/YYYY')) AS descricao,
  CASE
    WHEN apd.data_validade < CURRENT_DATE THEN 'alta'
    WHEN apd.data_validade < CURRENT_DATE + interval '10 days' THEN 'alta'
    WHEN apd.data_validade < CURRENT_DATE + interval '20 days' THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  apd.data_validade::timestamptz AS referencia_data,
  '/ages'::text AS link
FROM public.ages_profissionais_documentos apd
WHERE apd.data_validade IS NOT NULL
  AND apd.data_validade <= CURRENT_DATE + interval '30 days'

UNION ALL

SELECT
  ('licitacao-' || li.id::text) AS id,
  'ee54a8a5-47b1-4059-881a-381b9f5b82f1'::uuid AS setor_id,
  'licitacao'::text AS origem,
  li.id AS recurso_id,
  COALESCE(li.titulo, li.numero_edital, 'Licitação') AS titulo,
  ('Limite em ' || li.data_limite::text) AS descricao,
  CASE
    WHEN li.data_limite < now() + interval '3 days' THEN 'alta'
    WHEN li.data_limite < now() + interval '7 days' THEN 'media'
    ELSE 'baixa'
  END AS urgencia,
  li.data_limite::timestamptz AS referencia_data,
  '/licitacoes'::text AS link
FROM public.licitacoes li
WHERE li.data_limite >= CURRENT_DATE
  AND li.data_limite <= CURRENT_DATE + interval '14 days'
  AND li.status NOT IN ('descarte_edital','suspenso_revogado','nao_ganhamos','adjudicacao_homologacao','arrematados');

CREATE UNIQUE INDEX vw_worklist_pendencias_setor_id_uidx
  ON public.vw_worklist_pendencias_setor (id);
CREATE INDEX vw_worklist_pendencias_setor_setor_idx
  ON public.vw_worklist_pendencias_setor (setor_id);

GRANT SELECT ON public.vw_worklist_pendencias_setor TO authenticated;
GRANT SELECT ON public.vw_worklist_pendencias_setor TO anon;
GRANT ALL ON public.vw_worklist_pendencias_setor TO service_role;

REFRESH MATERIALIZED VIEW public.vw_worklist_pendencias_setor;
