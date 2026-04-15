-- 1. Adicionar 15 colunas (3 por linha de alimentação)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enrich_one boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_one timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_one timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_two boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_two timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_two timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_three boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_three timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_three timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_four boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_four timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_four timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_five boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_five timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_five timestamptz;

-- 2. Backfill: marcar enrich_one = true para leads já enriquecidos
UPDATE leads l
SET enrich_one = true,
    last_attempt_at_one = le.last_attempt_at,
    expires_at_one = COALESCE(le.expires_at, le.completed_at + INTERVAL '12 months')
FROM lead_enrichments le
WHERE le.lead_id = l.id
  AND le.pipeline = 'enrich_v1'
  AND le.status IN ('concluido', 'alimentado');

-- 3. Índices filtrados para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_leads_enrich_one ON leads (enrich_one) WHERE enrich_one = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_two ON leads (enrich_two) WHERE enrich_two = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_three ON leads (enrich_three) WHERE enrich_three = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_four ON leads (enrich_four) WHERE enrich_four = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_five ON leads (enrich_five) WHERE enrich_five = false;

-- 4. Comentários
COMMENT ON COLUMN leads.enrich_one IS 'Linha 1 - Import-leads (Tiago): alimentado?';
COMMENT ON COLUMN leads.enrich_two IS 'Linha 2 - Residentes: alimentado?';
COMMENT ON COLUMN leads.enrich_three IS 'Linha 3 - Lemit: alimentado?';
COMMENT ON COLUMN leads.enrich_four IS 'Linha 4 - Lifeshub: alimentado?';
COMMENT ON COLUMN leads.enrich_five IS 'Linha 5 - Especialidade: alimentado?';