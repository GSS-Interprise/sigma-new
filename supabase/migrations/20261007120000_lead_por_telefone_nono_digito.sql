-- Casamento de telefone com lead tolerante ao formato.
--
-- Dois furos que faziam conversa de WhatsApp não achar o lead:
--  1. O WhatsApp identifica muitos celulares brasileiros SEM o nono dígito (wa_id legado),
--     e o cadastro guarda COM. A comparação exata nunca casava.
--  2. `telefones_adicionais` é gravado sem "+" (5548999990000) e a busca chegava com "+",
--     então telefone adicional nunca era encontrado.

CREATE OR REPLACE FUNCTION public.phone_br_variants(p_phone text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH d AS (SELECT regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') AS n),
  b AS (
    SELECT n, CASE
      -- celular sem o nono dígito (assinante começa em 6-9; fixo começa em 2-5 e não muda)
      WHEN n ~ '^55\d{2}[6-9]\d{7}$' THEN substr(n, 1, 4) || '9' || substr(n, 5)
      WHEN n ~ '^55\d{2}9[6-9]\d{7}$' THEN substr(n, 1, 4) || substr(n, 6)
    END AS alt
    FROM d
  )
  SELECT CASE WHEN n = '' THEN ARRAY[]::text[]
              ELSE array_remove(ARRAY[n, '+' || n, alt, '+' || alt], NULL) END
  FROM b;
$function$;

-- Sem este índice a busca por telefone adicional varre a tabela inteira a cada mensagem.
CREATE INDEX IF NOT EXISTS idx_leads_telefones_adicionais_gin
  ON public.leads USING gin (telefones_adicionais);

CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_phone text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v text[] := public.phone_br_variants(p_phone);
  r uuid;
BEGIN
  IF cardinality(v) = 0 THEN RETURN NULL; END IF;

  -- Telefone principal de lead ativo; o número exatamente como chegou tem preferência.
  SELECT id INTO r FROM public.leads
   WHERE phone_e164 = ANY (v) AND merged_into_id IS NULL
   ORDER BY (phone_e164 = p_phone) DESC LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  SELECT id INTO r FROM public.leads
   WHERE telefones_adicionais && v AND merged_into_id IS NULL
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF r IS NOT NULL THEN RETURN r; END IF;

  -- Último recurso: lead já unificado em outro (comportamento anterior).
  SELECT id INTO r FROM public.leads
   WHERE phone_e164 = ANY (v) OR telefones_adicionais && v
   LIMIT 1;
  RETURN r;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.phone_br_variants(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(text) TO authenticated, service_role, anon;
