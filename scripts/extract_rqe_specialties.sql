WITH raw_parts AS (
  SELECT DISTINCT part
  FROM leads,
       LATERAL regexp_split_to_table(
         regexp_replace(rqe, '\(([^)]+)\)', ', \1', 'g'),
         '\s*,\s*(?=[A-Z])'
       ) AS part
  WHERE rqe IS NOT NULL AND rqe != '' AND merged_into_id IS NULL
),
cleaned AS (
  SELECT DISTINCT UPPER(TRIM(regexp_replace(part, '\s*[-]?\s*RQE\s*(N|Nº)\s*\d+', '', 'gi'))) as esp_nome
  FROM raw_parts
  WHERE part != ''
)
SELECT esp_nome,
       CASE WHEN EXISTS (SELECT 1 FROM especialidades e WHERE e.nome = c.esp_nome OR LOWER(c.esp_nome) = ANY(e.aliases))
            THEN 'EXISTE'
            ELSE 'NOVA'
       END as status
FROM cleaned c
WHERE esp_nome != '' AND length(esp_nome) > 2
ORDER BY status DESC, esp_nome
