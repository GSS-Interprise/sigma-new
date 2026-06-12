DROP MATERIALIZED VIEW IF EXISTS public.vw_worklist_pendencias_setor;

CREATE MATERIALIZED VIEW public.vw_worklist_pendencias_setor AS
SELECT 'lead-canal-'::text || cplc.canal AS id,
    '6dfff5fe-e51c-4258-95d0-cdc84b179985'::uuid AS setor_id,
    'lead'::text AS origem,
    gen_random_uuid() AS recurso_id,
    'Leads em aberto · '::text || initcap(cplc.canal) AS titulo,
    (count(*)::text || ' leads em aberto há 4+ dias na linha '::text) || cplc.canal AS descricao,
    CASE
        WHEN count(*) FILTER (WHERE cplc.entrou_em < (now() - '14 days'::interval)) > 0 THEN 'alta'::text
        WHEN count(*) FILTER (WHERE cplc.entrou_em < (now() - '7 days'::interval)) > 0 THEN 'media'::text
        ELSE 'baixa'::text
    END AS urgencia,
    min(cplc.entrou_em) AS referencia_data,
    '/disparos/acompanhamento'::text AS link
   FROM campanha_proposta_lead_canais cplc
  WHERE cplc.status_final = 'aberto'::text AND cplc.entrou_em < (now() - '4 days'::interval)
  GROUP BY cplc.canal
 HAVING count(*) > 0
UNION ALL
 SELECT 'contrato-'::text || c.id::text AS id,
    '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
    'contrato'::text AS origem,
    c.id AS recurso_id,
    COALESCE(c.codigo_contrato, 'Contrato sem código'::text) AS titulo,
    'Vence em '::text || to_char(eff.data_fim_efetiva::timestamp with time zone, 'DD/MM/YYYY'::text) AS descricao,
    CASE
        WHEN eff.data_fim_efetiva < CURRENT_DATE THEN 'alta'::text
        WHEN eff.data_fim_efetiva < (CURRENT_DATE + GREATEST(COALESCE(c.dias_aviso_vencimento, 60) / 3, 1)::double precision * '1 day'::interval) THEN 'alta'::text
        WHEN eff.data_fim_efetiva < (CURRENT_DATE + GREATEST(COALESCE(c.dias_aviso_vencimento, 60) * 2 / 3, 1)::double precision * '1 day'::interval) THEN 'media'::text
        ELSE 'baixa'::text
    END AS urgencia,
    eff.data_fim_efetiva::timestamp with time zone AS referencia_data,
    '/contratos'::text AS link
   FROM contratos c
   CROSS JOIN LATERAL (
     SELECT GREATEST(
       c.data_fim,
       (SELECT MAX(at.data_termino) FROM contrato_aditivos_tempo at WHERE at.contrato_id = c.id)
     ) AS data_fim_efetiva
   ) eff
  WHERE eff.data_fim_efetiva IS NOT NULL
    AND eff.data_fim_efetiva <= (CURRENT_DATE + COALESCE(c.dias_aviso_vencimento, 60)::double precision * '1 day'::interval)
    AND lower(COALESCE(c.status_contrato, '')) = 'ativo'
UNION ALL
 SELECT 'medico-doc-'::text || md.id::text AS id,
    '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
    'contrato'::text AS origem,
    md.id AS recurso_id,
    'Documento: '::text || COALESCE(md.arquivo_nome, md.tipo_documento::text, 'Documento'::text) AS titulo,
    'Validade em '::text || to_char(md.data_validade::timestamp with time zone, 'DD/MM/YYYY'::text) AS descricao,
    CASE
        WHEN md.data_validade < CURRENT_DATE THEN 'alta'::text
        WHEN md.data_validade < (CURRENT_DATE + '10 days'::interval) THEN 'alta'::text
        WHEN md.data_validade < (CURRENT_DATE + '20 days'::interval) THEN 'media'::text
        ELSE 'baixa'::text
    END AS urgencia,
    md.data_validade::timestamp with time zone AS referencia_data,
    '/medicos'::text AS link
   FROM medico_documentos md
  WHERE md.data_validade IS NOT NULL AND md.data_validade <= (CURRENT_DATE + '30 days'::interval)
UNION ALL
 SELECT 'ages-prof-doc-'::text || apd.id::text AS id,
    '1a57b82d-be39-408c-aec7-c49ee97a692c'::uuid AS setor_id,
    'contrato'::text AS origem,
    apd.id AS recurso_id,
    'Documento: '::text || COALESCE(apd.arquivo_nome, apd.tipo_documento, 'Documento'::text) AS titulo,
    'Validade em '::text || to_char(apd.data_validade::timestamp with time zone, 'DD/MM/YYYY'::text) AS descricao,
    CASE
        WHEN apd.data_validade < CURRENT_DATE THEN 'alta'::text
        WHEN apd.data_validade < (CURRENT_DATE + '10 days'::interval) THEN 'alta'::text
        WHEN apd.data_validade < (CURRENT_DATE + '20 days'::interval) THEN 'media'::text
        ELSE 'baixa'::text
    END AS urgencia,
    apd.data_validade::timestamp with time zone AS referencia_data,
    '/ages'::text AS link
   FROM ages_profissionais_documentos apd
  WHERE apd.data_validade IS NOT NULL AND apd.data_validade <= (CURRENT_DATE + '30 days'::interval)
UNION ALL
 SELECT 'licitacao-'::text || li.id::text AS id,
    'ee54a8a5-47b1-4059-881a-381b9f5b82f1'::uuid AS setor_id,
    'licitacao'::text AS origem,
    li.id AS recurso_id,
    COALESCE(li.titulo, li.numero_edital, 'Licitação'::text) AS titulo,
    'Limite em '::text || li.data_limite::text AS descricao,
    CASE
        WHEN li.data_limite < (now() + '3 days'::interval) THEN 'alta'::text
        WHEN li.data_limite < (now() + '7 days'::interval) THEN 'media'::text
        ELSE 'baixa'::text
    END AS urgencia,
    li.data_limite::timestamp with time zone AS referencia_data,
    '/licitacoes'::text AS link
   FROM licitacoes li
  WHERE li.data_limite >= CURRENT_DATE
    AND li.data_limite <= (CURRENT_DATE + '14 days'::interval)
    AND (li.status <> ALL (ARRAY['descarte_edital'::status_licitacao, 'suspenso_revogado'::status_licitacao, 'nao_ganhamos'::status_licitacao, 'adjudicacao_homologacao'::status_licitacao, 'arrematados'::status_licitacao]));

GRANT SELECT ON public.vw_worklist_pendencias_setor TO authenticated, service_role;