-- Normaliza um nome: minúsculo, sem acentos, sem pontuação
CREATE OR REPLACE FUNCTION norm_nome(p_nome TEXT) RETURNS TEXT AS $$
  SELECT LOWER(
    translate(
      COALESCE(p_nome, ''),
      'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇñÑ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUCnN'
    )
  );
$$ LANGUAGE SQL IMMUTABLE;

-- Extrai palavras significativas de um nome (remove stopwords)
CREATE OR REPLACE FUNCTION nome_palavras(p_nome TEXT) RETURNS TEXT[] AS $$
  SELECT COALESCE(
    array_agg(w ORDER BY w),
    ARRAY[]::text[]
  )
  FROM (
    SELECT DISTINCT w
    FROM unnest(string_to_array(regexp_replace(norm_nome(p_nome), '[^a-z ]', ' ', 'g'), ' ')) AS w
    WHERE length(w) >= 2
      AND w NOT IN ('de','da','do','das','dos','di','du','del','della','della','e')
  ) sub;
$$ LANGUAGE SQL IMMUTABLE;

-- Conta quantas palavras significativas dois nomes têm em comum
CREATE OR REPLACE FUNCTION nome_palavras_comuns(p_nome1 TEXT, p_nome2 TEXT) RETURNS INT AS $$
  SELECT COALESCE(
    (SELECT COUNT(*)::int
     FROM unnest(nome_palavras(p_nome1)) w
     WHERE w = ANY(nome_palavras(p_nome2))),
    0
  );
$$ LANGUAGE SQL IMMUTABLE;

-- Normaliza telefone para comparação (apenas dígitos)
CREATE OR REPLACE FUNCTION norm_phone(p TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g');
$$ LANGUAGE SQL IMMUTABLE;

-- Normaliza CRM para comparação (remove /UF, espaços, pontuação)
CREATE OR REPLACE FUNCTION norm_crm(p TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(LOWER(COALESCE(p, '')), '[^0-9a-z]', '', 'g');
$$ LANGUAGE SQL IMMUTABLE;
