-- =====================================================================
-- Backfill especialidades: texto cru CFM (leads.especialidade) -> junction
-- lead_especialidades. Idempotente (ON CONFLICT DO NOTHING).
-- Contexto 10/06/2026: import CFM gravou especialidade como texto
-- "&NOME - RQE Nº: 123[&NOME2 - RQE...]" e a junction nunca recebeu —
-- 294.692 leads com especialidade invisíveis pro filtro de campanha.
-- ~0,6% das strings têm mojibake (UTF-8 duplo-encodado) -> fix_mojibake_tmp.
-- =====================================================================

-- PASSO 1: helper de mojibake (dropada no passo final)
CREATE OR REPLACE FUNCTION public.fix_mojibake_tmp(t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF t IS NULL OR t !~ 'Ã' THEN RETURN t; END IF;
  RETURN convert_from(convert_to(t, 'LATIN1'), 'UTF8');
EXCEPTION WHEN OTHERS THEN
  RETURN t;
END $$;

-- PASSO 2: backfill do texto CFM (rodar como statement separado)
WITH alias_map(alias, canonical) AS (VALUES
  ('DIAGNÓSTICO POR IMAGEM',                  'RADIOLOGIA E DIAGNÓSTICO POR IMAGEM'),
  ('OBSTETRÍCIA',                             'GINECOLOGIA E OBSTETRÍCIA'),
  ('MEDICINA INTERNA OU CLÍNICA MÉDICA',      'CLÍNICA MÉDICA'),
  ('GINECOLOGIA',                             'GINECOLOGIA E OBSTETRÍCIA'),
  ('CANCEROLOGIA/CANCEROLOGIA CIRÚRGICA',     'CANCEROLOGIA CIRÚRGICA'),
  ('ENDOSCOPIA DIGESTIVA',                    'ENDOSCOPIA'),
  ('ENDOCRINOLOGIA',                          'ENDOCRINOLOGIA E METABOLOGIA'),
  ('PATOLOGIA CLÍNICA/MEDICINA LABORATORIAL', 'PATOLOGIA CLÍNICA / MEDICINA LABORATORIAL'),
  ('RADIOLOGIA',                              'RADIOLOGIA E DIAGNÓSTICO POR IMAGEM'),
  ('PATOLOGIA CLÍNICA',                       'PATOLOGIA CLÍNICA / MEDICINA LABORATORIAL'),
  ('CANCEROLOGIA/CANCEROLOGIA PEDIÁTRICA',    'CANCEROLOGIA PEDIÁTRICA'),
  ('FISIATRIA',                               'MEDICINA FÍSICA E REABILITAÇÃO'),
  ('TERAPIA INTENSIVA',                       'MEDICINA INTENSIVA'),
  ('HEMATOLOGIA',                             'HEMATOLOGIA E HEMOTERAPIA'),
  ('PROCTOLOGIA',                             'COLOPROCTOLOGIA'),
  ('ANATOMIA PATOLÓGICA',                     'PATOLOGIA'),
  ('MEDICINA LEGAL',                          'MEDICINA LEGAL E PERÍCIA MÉDICA'),
  ('HEMOTERAPIA',                             'HEMATOLOGIA E HEMOTERAPIA'),
  ('ENDOSCOPIA PERORAL',                      'ENDOSCOPIA'),
  ('MEDICINA GERAL COMUNITÁRIA',              'MEDICINA DE FAMÍLIA E COMUNIDADE'),
  ('DOENÇAS INFECCIOSAS E PARASITÁRIAS',      'INFECTOLOGIA'),
  ('RADIODIAGNÓSTICO',                        'RADIOLOGIA E DIAGNÓSTICO POR IMAGEM'),
  ('ULTRASSONOGRAFIA',                        'ULTRASSONOGRAFIA GERAL'),
  ('ULTRASSONOGRAFIA EM GERAL',               'ULTRASSONOGRAFIA GERAL'),
  ('PNEUMOLOGIA E TISIOLOGIA',                'PNEUMOLOGIA'),
  ('GERIATRIA E GERONTOLOGIA',                'GERIATRIA'),
  ('ONCOLOGIA',                               'ONCOLOGIA CLÍNICA'),
  ('TISIOLOGIA',                              'PNEUMOLOGIA'),
  ('GENÉTICA CLÍNICA',                        'GENÉTICA MÉDICA'),
  ('CIRURGIA VASCULAR PERIFÉRICA',            'CIRURGIA VASCULAR'),
  ('NEUROPEDIATRIA',                          'NEUROLOGIA PEDIÁTRICA'),
  ('ALERGIA E IMUNOPATOLOGIA',                'ALERGIA E IMUNOLOGIA'),
  ('TERAPIA INTENSIVA PEDIÁTRICA',            'MEDICINA INTENSIVA PEDIÁTRICA'),
  ('UTI PEDIATRICA',                          'MEDICINA INTENSIVA PEDIÁTRICA'),
  ('MEDICINA DO ESPORTE',                     'MEDICINA ESPORTIVA'),
  ('PSIQUIATRIA INFANTIL',                    'PSIQUIATRIA DA INFÂNCIA E ADOLESCÊNCIA'),
  ('GENERALISTA',                             'MEDICINA GENERALISTA'),
  ('OTORRINOLARINGOLOGISTA',                  'OTORRINOLARINGOLOGIA'),
  ('MÉDICA PSIQUIATRA',                       'PSIQUIATRIA'),
  ('MÉDICA PEDIATRA',                         'PEDIATRIA'),
  ('CIRURGIA DIGESTIVA',                      'CIRURGIA DO APARELHO DIGESTIVO'),
  ('ENDOSCOPIA PERORAL VIAS AÉREAS',          'ENDOSCOPIA RESPIRATÓRIA'),
  ('TOCO-GINECOLOGIA',                        'GINECOLOGIA E OBSTETRÍCIA')
),
seg AS (
  SELECT
    l.id AS lead_id,
    upper(trim(regexp_replace(
      split_part(fix_mojibake_tmp(s), ' - RQE', 1),
      '[[:space:]]+', ' ', 'g'
    ))) AS nome_norm,
    nullif(trim(substring(fix_mojibake_tmp(s) FROM 'RQE[^0-9]*([0-9]+)')), '') AS rqe
  FROM leads l, regexp_split_to_table(l.especialidade, '&') s
  WHERE l.merged_into_id IS NULL
    AND l.especialidade IS NOT NULL AND l.especialidade <> ''
    AND trim(s) <> ''
),
esp AS (
  SELECT id, unaccent(upper(trim(nome))) AS k FROM especialidades
),
matched AS (
  SELECT DISTINCT ON (seg.lead_id, esp.id)
    seg.lead_id, esp.id AS especialidade_id, seg.rqe
  FROM seg
  LEFT JOIN alias_map am ON am.alias = seg.nome_norm
  JOIN esp ON esp.k = unaccent(COALESCE(am.canonical, seg.nome_norm))
  ORDER BY seg.lead_id, esp.id, seg.rqe NULLS LAST
)
INSERT INTO lead_especialidades (lead_id, especialidade_id, rqe, fonte)
SELECT lead_id, especialidade_id, rqe, 'cfm_backfill'
FROM matched
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- PASSO 3: coluna legada especialidade_id (uuid direto) -> junction
INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT l.id, l.especialidade_id, 'backfill_legacy_id'
FROM leads l
JOIN especialidades e ON e.id = l.especialidade_id
WHERE l.merged_into_id IS NULL AND l.especialidade_id IS NOT NULL
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;

-- PASSO 4: auditoria pós-backfill
-- select fonte, count(*) from lead_especialidades group by 1;
-- select count(distinct lead_id) from lead_especialidades;

-- PASSO 5: limpeza
-- DROP FUNCTION public.fix_mojibake_tmp(text);
