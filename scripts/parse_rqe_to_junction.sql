-- Parse RQE field and populate lead_especialidades junction table
-- Step 1: Extract specialty names from RQE, match to especialidades table, insert into junction

INSERT INTO lead_especialidades (lead_id, especialidade_id, fonte)
SELECT DISTINCT l.id, e.id, 'rqe_parse'
FROM leads l,
     LATERAL regexp_split_to_table(
       regexp_replace(l.rqe, '\(([^)]+)\)', ', \1', 'g'),
       ',\s*'
     ) AS raw_part,
     LATERAL (SELECT UPPER(TRIM(regexp_replace(raw_part, '\s*-?\s*RQE\s*(N|Nº|Nº:)?\s*:?\s*\d+.*', '', 'i'))) AS esp_nome) parsed
JOIN especialidades e ON (
  e.nome = parsed.esp_nome
  OR LOWER(parsed.esp_nome) = ANY(e.aliases)
)
WHERE l.rqe IS NOT NULL
  AND l.rqe != ''
  AND l.merged_into_id IS NULL
  AND parsed.esp_nome != ''
  AND length(parsed.esp_nome) > 3
  AND parsed.esp_nome !~ '^\d'
  AND parsed.esp_nome NOT LIKE 'Nº%'
  AND parsed.esp_nome NOT LIKE 'RQE%'
ON CONFLICT (lead_id, especialidade_id) DO NOTHING;
