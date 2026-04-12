-- Fase 2c fuzzy: mesmo email + match fuzzy de nome + coluna de reforço
INSERT INTO merge_plan (match_type, match_key, canonical_id, duplicate_ids, canonical_tem_cpf, canonical_filhos, duplicates_filhos, cluster_size)
WITH lead_filhos AS (
  SELECT l.id,
    ((SELECT COUNT(*) FROM disparos_contatos dc WHERE dc.lead_id = l.id)
    + (SELECT COUNT(*) FROM lead_historico lh WHERE lh.lead_id = l.id)
    + (SELECT COUNT(*) FROM lead_anotacoes la WHERE la.lead_id = l.id)
    + (SELECT COUNT(*) FROM lead_anexos lx WHERE lx.lead_id = l.id)
    + (SELECT COUNT(*) FROM medicos m WHERE m.lead_id = l.id)
    + (SELECT COUNT(*) FROM email_contatos ec WHERE ec.lead_id = l.id)
    + (SELECT COUNT(*) FROM proposta p WHERE p.lead_id = l.id)
    + (SELECT COUNT(*) FROM email_interacoes ei WHERE ei.lead_id = l.id)
    + (SELECT COUNT(*) FROM banco_interesse_leads b WHERE b.lead_id = l.id)
    + (SELECT COUNT(*) FROM sigzap_conversations sc WHERE sc.lead_id = l.id)) AS total
  FROM leads l WHERE l.merged_into_id IS NULL
),
-- Escolhe canonical por email (prefere CPF, mais filhos, mais antigo)
email_canonical AS (
  SELECT DISTINCT ON (LOWER(TRIM(l.email)))
    LOWER(TRIM(l.email)) as email_norm,
    l.id as canonical_id
  FROM leads l
  LEFT JOIN lead_filhos lf ON lf.id = l.id
  WHERE l.email IS NOT NULL AND TRIM(l.email) != ''
    AND LOWER(l.email) NOT IN ('ajustar@gss.com.br', 'contato@exemplo.com')
    AND l.merged_into_id IS NULL
  ORDER BY LOWER(TRIM(l.email)),
    (CASE WHEN l.cpf IS NOT NULL AND l.cpf != '' THEN 0 ELSE 1 END),
    (CASE WHEN l.phone_e164 IS NOT NULL AND l.phone_e164 != '' THEN 0 ELSE 1 END),
    COALESCE(lf.total, 0) DESC,
    l.created_at ASC
),
-- Emails que têm mais de um lead
emails_com_duplicata AS (
  SELECT LOWER(TRIM(email)) as email_norm
  FROM leads
  WHERE email IS NOT NULL AND TRIM(email) != ''
    AND LOWER(email) NOT IN ('ajustar@gss.com.br', 'contato@exemplo.com')
    AND merged_into_id IS NULL
  GROUP BY LOWER(TRIM(email))
  HAVING COUNT(*) > 1
),
-- Pares: canonical vs cada outro lead do mesmo email
pares AS (
  SELECT
    ec.canonical_id,
    ec.email_norm,
    d.id as duplicate_id,
    nome_palavras_comuns(c.nome, d.nome) as palavras_comuns,
    (norm_phone(c.phone_e164) = norm_phone(d.phone_e164)
      AND c.phone_e164 IS NOT NULL AND d.phone_e164 IS NOT NULL) as phone_match,
    (norm_crm(c.crm) = norm_crm(d.crm)
      AND c.crm IS NOT NULL AND d.crm IS NOT NULL) as crm_match,
    (c.data_nascimento = d.data_nascimento
      AND c.data_nascimento IS NOT NULL) as dtnasc_match
  FROM email_canonical ec
  JOIN emails_com_duplicata edup ON edup.email_norm = ec.email_norm
  JOIN leads c ON c.id = ec.canonical_id
  JOIN leads d ON LOWER(TRIM(d.email)) = ec.email_norm
               AND d.id != ec.canonical_id
               AND d.merged_into_id IS NULL
),
-- Filtra pelos critérios fuzzy
qualificados AS (
  SELECT canonical_id, email_norm, duplicate_id
  FROM pares
  WHERE palavras_comuns >= 3
     OR (palavras_comuns >= 2 AND (phone_match OR crm_match OR dtnasc_match))
),
-- Agrupa por canonical
clusters AS (
  SELECT
    canonical_id,
    email_norm,
    array_agg(duplicate_id) as duplicate_ids
  FROM qualificados
  GROUP BY canonical_id, email_norm
)
SELECT
  'email_fuzzy' as match_type,
  cl.email_norm as match_key,
  cl.canonical_id,
  cl.duplicate_ids,
  (c.cpf IS NOT NULL AND c.cpf != '') as canonical_tem_cpf,
  COALESCE(clf.total, 0)::INT as canonical_filhos,
  (SELECT COALESCE(SUM(COALESCE(dlf.total, 0))::INT, 0)
   FROM unnest(cl.duplicate_ids) dup_id
   LEFT JOIN lead_filhos dlf ON dlf.id = dup_id) as duplicates_filhos,
  (1 + array_length(cl.duplicate_ids, 1)) as cluster_size
FROM clusters cl
JOIN leads c ON c.id = cl.canonical_id
LEFT JOIN lead_filhos clf ON clf.id = cl.canonical_id;
