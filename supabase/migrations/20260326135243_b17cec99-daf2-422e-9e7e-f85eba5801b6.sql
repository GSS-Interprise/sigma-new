
-- =====================================================================
-- FIX 1: Update trigger — only recalculate chave_unica when relevant
-- fields change (prevents conflict on enrichment-only updates)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- On UPDATE: skip recalculation if CPF, nome and data_nascimento are unchanged
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.cpf IS NOT DISTINCT FROM OLD.cpf)
       AND (NEW.nome IS NOT DISTINCT FROM OLD.nome)
       AND (NEW.data_nascimento IS NOT DISTINCT FROM OLD.data_nascimento) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- (Re)calculate chave_unica
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

-- =====================================================================
-- FIX 2: Clean up duplicate leads
-- DELETE newer duplicates FIRST, then fix chave_unica on the kept ones
-- =====================================================================

-- cpf 00857458043: remove newer (22217718), then fix older (2b786cfa)
DELETE FROM leads WHERE id = '22217718-9dfb-49ea-a222-7b63737d780d';
UPDATE leads SET chave_unica = 'cpf_00857458043'
  WHERE id = '2b786cfa-46fa-4426-bc7d-eefad71b65b0' AND (chave_unica IS NULL OR chave_unica != 'cpf_00857458043');

-- cpf 05361763969: remove newer (423ae390), fix older (a7c742a4)
DELETE FROM leads WHERE id = '423ae390-66c6-4b65-b486-fdf5c2fd2fd7';
UPDATE leads SET chave_unica = 'cpf_05361763969'
  WHERE id = 'a7c742a4-b33f-48e7-afa5-5f25e4205a52' AND (chave_unica IS NULL OR chave_unica != 'cpf_05361763969');

-- cpf 07134818896: remove newer (13a5fd04), fix older (9747214f)
DELETE FROM leads WHERE id = '13a5fd04-f607-46c7-9bd4-64e88c5a4607';
UPDATE leads SET chave_unica = 'cpf_07134818896'
  WHERE id = '9747214f-557e-4319-9116-f668f88ea07c' AND (chave_unica IS NULL OR chave_unica != 'cpf_07134818896');

-- cpf 39992926600: remove the one with NULL chave_unica (15785c8a), keep the other
DELETE FROM leads WHERE id = '15785c8a-71e5-4250-8748-0ac95b759cc7';
