
-- 1. Adicionar coluna especialidades_crua
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS especialidades_crua TEXT;

-- 2. Limpar CPFs duplicados (manter o mais recente)
DELETE FROM leads 
WHERE id NOT IN (
  SELECT DISTINCT ON (cpf) id 
  FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  ORDER BY cpf, updated_at DESC NULLS LAST
)
AND cpf IN (
  SELECT cpf FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  GROUP BY cpf HAVING COUNT(*) > 1
);

-- 3. Criar indice unique parcial no CPF
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cpf_unique 
ON public.leads (cpf) WHERE cpf IS NOT NULL AND TRIM(cpf) != '';

-- 4. Relaxar phone_e164 (permitir NULL)
ALTER TABLE public.leads ALTER COLUMN phone_e164 DROP NOT NULL;

-- 5. Atualizar trigger chave_unica para priorizar CPF
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cpf IS NOT NULL AND TRIM(NEW.cpf) != '' THEN
    NEW.chave_unica := 'cpf_' || REGEXP_REPLACE(NEW.cpf, '[^0-9]', '', 'g');
  ELSIF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
