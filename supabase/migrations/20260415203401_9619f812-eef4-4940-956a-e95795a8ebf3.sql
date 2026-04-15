
-- Backfill: ensure lead_enrichments has rows for leads marked enrich_one = true
-- that might not have a lead_enrichments record yet
INSERT INTO lead_enrichments (lead_id, pipeline, status, last_attempt_at, completed_at, expires_at)
SELECT l.id, 'enrich_v1', 'concluido', l.last_attempt_at_one, l.last_attempt_at_one, l.expires_at_one
FROM leads l
WHERE l.enrich_one = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_enrichments le
    WHERE le.lead_id = l.id AND le.pipeline = 'enrich_v1'
  );

-- Same for enrich_two through enrich_five (in case any were set)
INSERT INTO lead_enrichments (lead_id, pipeline, status, last_attempt_at, completed_at, expires_at)
SELECT l.id, 'enrich_residentes', 'concluido', l.last_attempt_at_two, l.last_attempt_at_two, l.expires_at_two
FROM leads l
WHERE l.enrich_two = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_enrichments le
    WHERE le.lead_id = l.id AND le.pipeline = 'enrich_residentes'
  );

INSERT INTO lead_enrichments (lead_id, pipeline, status, last_attempt_at, completed_at, expires_at)
SELECT l.id, 'enrich_lemit', 'concluido', l.last_attempt_at_three, l.last_attempt_at_three, l.expires_at_three
FROM leads l
WHERE l.enrich_three = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_enrichments le
    WHERE le.lead_id = l.id AND le.pipeline = 'enrich_lemit'
  );

INSERT INTO lead_enrichments (lead_id, pipeline, status, last_attempt_at, completed_at, expires_at)
SELECT l.id, 'enrich_lifeshub', 'concluido', l.last_attempt_at_four, l.last_attempt_at_four, l.expires_at_four
FROM leads l
WHERE l.enrich_four = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_enrichments le
    WHERE le.lead_id = l.id AND le.pipeline = 'enrich_lifeshub'
  );

INSERT INTO lead_enrichments (lead_id, pipeline, status, last_attempt_at, completed_at, expires_at)
SELECT l.id, 'enrich_especialidade', 'concluido', l.last_attempt_at_five, l.last_attempt_at_five, l.expires_at_five
FROM leads l
WHERE l.enrich_five = true
  AND NOT EXISTS (
    SELECT 1 FROM lead_enrichments le
    WHERE le.lead_id = l.id AND le.pipeline = 'enrich_especialidade'
  );

-- Drop filtered indexes
DROP INDEX IF EXISTS idx_leads_enrich_one;
DROP INDEX IF EXISTS idx_leads_enrich_two;
DROP INDEX IF EXISTS idx_leads_enrich_three;
DROP INDEX IF EXISTS idx_leads_enrich_four;
DROP INDEX IF EXISTS idx_leads_enrich_five;

-- Drop the 15 columns from leads
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS enrich_one,
  DROP COLUMN IF EXISTS last_attempt_at_one,
  DROP COLUMN IF EXISTS expires_at_one,
  DROP COLUMN IF EXISTS enrich_two,
  DROP COLUMN IF EXISTS last_attempt_at_two,
  DROP COLUMN IF EXISTS expires_at_two,
  DROP COLUMN IF EXISTS enrich_three,
  DROP COLUMN IF EXISTS last_attempt_at_three,
  DROP COLUMN IF EXISTS expires_at_three,
  DROP COLUMN IF EXISTS enrich_four,
  DROP COLUMN IF EXISTS last_attempt_at_four,
  DROP COLUMN IF EXISTS expires_at_four,
  DROP COLUMN IF EXISTS enrich_five,
  DROP COLUMN IF EXISTS last_attempt_at_five,
  DROP COLUMN IF EXISTS expires_at_five;

-- Add optimized index on lead_enrichments for pipeline queries
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_pipeline_status
  ON lead_enrichments (pipeline, status);

-- Add index for the common query: "leads NOT yet enriched for pipeline X"
-- This will be done via LEFT JOIN leads / lead_enrichments
CREATE INDEX IF NOT EXISTS idx_lead_enrichments_lead_pipeline
  ON lead_enrichments (lead_id, pipeline);
