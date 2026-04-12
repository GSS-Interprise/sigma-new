-- =====================================================
-- 1. RESTRICTIVE RLS policy — esconde leads merged
-- (ANDed com todas as permissive policies existentes)
-- Service role (edge functions, admin) continua vendo tudo
-- =====================================================
CREATE POLICY "hide_merged_leads" ON leads AS RESTRICTIVE
  FOR SELECT TO public
  USING (merged_into_id IS NULL);

-- =====================================================
-- 2. PARTIAL INDEXES — performance para queries filtradas
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_leads_active_id
  ON leads (id) WHERE merged_into_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_active_phone
  ON leads (phone_e164) WHERE merged_into_id IS NULL AND phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_active_email
  ON leads (lower(email)) WHERE merged_into_id IS NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_active_cpf
  ON leads (cpf) WHERE merged_into_id IS NULL AND cpf IS NOT NULL AND trim(cpf) <> '';

CREATE INDEX IF NOT EXISTS idx_leads_active_nome
  ON leads (lower(nome)) WHERE merged_into_id IS NULL AND nome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_active_status
  ON leads (status, created_at DESC) WHERE merged_into_id IS NULL;

-- =====================================================
-- 3. UNIQUE INDEX — tornar parcial (só leads ativos)
-- para poder normalizar phone sem conflitar com merged
-- =====================================================
DROP INDEX IF EXISTS leads_phone_e164_key;
DROP INDEX IF EXISTS leads_phone_e164_unique;

CREATE UNIQUE INDEX leads_phone_e164_unique
  ON leads (phone_e164)
  WHERE merged_into_id IS NULL AND phone_e164 IS NOT NULL;

-- Mesma coisa para CPF e chave_unica (já são parciais, manter)
-- idx_leads_cpf_unique já é parcial (WHERE cpf IS NOT NULL AND trim != '')
-- idx_leads_chave_unica já é parcial (WHERE chave_unica IS NOT NULL)

-- =====================================================
-- 4. NORMALIZAR phone_e164 — adicionar + onde falta
-- (apenas leads ativos para evitar conflito com merged)
-- =====================================================
UPDATE leads
SET phone_e164 = '+' || phone_e164
WHERE phone_e164 IS NOT NULL
  AND phone_e164 <> ''
  AND phone_e164 NOT LIKE '+%'
  AND merged_into_id IS NULL;

-- =====================================================
-- 5. TRIGGER — normalizar phone_e164 automaticamente
-- em novos INSERT/UPDATE (prevenção futura)
-- =====================================================
CREATE OR REPLACE FUNCTION normalize_phone_e164()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.phone_e164 IS NOT NULL
     AND NEW.phone_e164 <> ''
     AND NEW.phone_e164 NOT LIKE '+%' THEN
    NEW.phone_e164 := '+' || NEW.phone_e164;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_normalize_phone ON leads;
CREATE TRIGGER trigger_normalize_phone
  BEFORE INSERT OR UPDATE OF phone_e164 ON leads
  FOR EACH ROW
  EXECUTE FUNCTION normalize_phone_e164();
