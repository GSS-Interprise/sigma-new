
-- 1. Renomear coluna modalidade para subtipo_modalidade
ALTER TABLE public.licitacoes RENAME COLUMN modalidade TO subtipo_modalidade;

-- 2. Criar coluna tipo_modalidade
ALTER TABLE public.licitacoes ADD COLUMN tipo_modalidade text;

-- 3. Popular tipo_modalidade baseado nos valores existentes de subtipo_modalidade
UPDATE public.licitacoes
SET tipo_modalidade = CASE
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRENCIA%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRÊNCIA%' THEN 'MODALIDADE'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CREDENCIAMENTO%' THEN 'PROC. AUXILIAR'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%DISPENSA%' THEN 'CONTR. DIRETA'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%INEXIGIBILIDADE%' THEN 'CONTR. DIRETA'
  WHEN UPPER(TRIM(subtipo_modalidade)) LIKE '%CHAMAMENTO%' THEN 'PROC. AUXILIAR'
  ELSE NULL
END
WHERE subtipo_modalidade IS NOT NULL;

-- 4. Normalizar subtipo_modalidade para valores padronizados
UPDATE public.licitacoes
SET subtipo_modalidade = 'Pregão Eletrônico'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%ELETRONICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%ELETRÔNICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%ELETRÔNICO%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%ELETRONICO%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Pregão Presencial'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGAO%PRESENCIAL%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%PREGÃO%PRESENCIAL%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Concorrência'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRENCIA%'
   OR UPPER(TRIM(subtipo_modalidade)) LIKE '%CONCORRÊNCIA%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Credenciamento'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CREDENCIAMENTO%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Dispensa'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%DISPENSA%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Inexigibilidade'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%INEXIGIBILIDADE%';

UPDATE public.licitacoes
SET subtipo_modalidade = 'Edital Chamamento'
WHERE UPPER(TRIM(subtipo_modalidade)) LIKE '%CHAMAMENTO%';
