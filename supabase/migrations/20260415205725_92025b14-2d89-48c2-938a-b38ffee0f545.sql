
-- Step 1: Add 15 new columns
ALTER TABLE public.lead_enrichments
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

-- Step 2: Backfill — consolidate existing rows into one row per lead
-- First, ensure one row per lead_id exists (pick the one with latest last_attempt_at)
-- We'll update the "winner" row with data from other pipeline rows

-- Update enrich_one from enrich_v1 rows
UPDATE public.lead_enrichments le SET
  enrich_one = true,
  last_attempt_at_one = sub.last_attempt_at,
  expires_at_one = sub.expires_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, last_attempt_at, expires_at
  FROM public.lead_enrichments
  WHERE pipeline = 'enrich_v1' AND status IN ('concluido', 'alimentado')
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
) sub
WHERE le.lead_id = sub.lead_id
  AND le.id = (
    SELECT id FROM public.lead_enrichments le2
    WHERE le2.lead_id = le.lead_id
    ORDER BY le2.last_attempt_at DESC NULLS LAST
    LIMIT 1
  );

-- Update enrich_two from enrich_residentes rows
UPDATE public.lead_enrichments le SET
  enrich_two = true,
  last_attempt_at_two = sub.last_attempt_at,
  expires_at_two = sub.expires_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, last_attempt_at, expires_at
  FROM public.lead_enrichments
  WHERE pipeline = 'enrich_residentes' AND status IN ('concluido', 'alimentado')
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
) sub
WHERE le.lead_id = sub.lead_id
  AND le.id = (
    SELECT id FROM public.lead_enrichments le2
    WHERE le2.lead_id = le.lead_id
    ORDER BY le2.last_attempt_at DESC NULLS LAST
    LIMIT 1
  );

-- Update enrich_three from enrich_lemit rows
UPDATE public.lead_enrichments le SET
  enrich_three = true,
  last_attempt_at_three = sub.last_attempt_at,
  expires_at_three = sub.expires_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, last_attempt_at, expires_at
  FROM public.lead_enrichments
  WHERE pipeline = 'enrich_lemit' AND status IN ('concluido', 'alimentado')
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
) sub
WHERE le.lead_id = sub.lead_id
  AND le.id = (
    SELECT id FROM public.lead_enrichments le2
    WHERE le2.lead_id = le.lead_id
    ORDER BY le2.last_attempt_at DESC NULLS LAST
    LIMIT 1
  );

-- Update enrich_four from enrich_lifeshub rows
UPDATE public.lead_enrichments le SET
  enrich_four = true,
  last_attempt_at_four = sub.last_attempt_at,
  expires_at_four = sub.expires_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, last_attempt_at, expires_at
  FROM public.lead_enrichments
  WHERE pipeline = 'enrich_lifeshub' AND status IN ('concluido', 'alimentado')
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
) sub
WHERE le.lead_id = sub.lead_id
  AND le.id = (
    SELECT id FROM public.lead_enrichments le2
    WHERE le2.lead_id = le.lead_id
    ORDER BY le2.last_attempt_at DESC NULLS LAST
    LIMIT 1
  );

-- Update enrich_five from enrich_especialidade rows
UPDATE public.lead_enrichments le SET
  enrich_five = true,
  last_attempt_at_five = sub.last_attempt_at,
  expires_at_five = sub.expires_at
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, last_attempt_at, expires_at
  FROM public.lead_enrichments
  WHERE pipeline = 'enrich_especialidade' AND status IN ('concluido', 'alimentado')
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
) sub
WHERE le.lead_id = sub.lead_id
  AND le.id = (
    SELECT id FROM public.lead_enrichments le2
    WHERE le2.lead_id = le.lead_id
    ORDER BY le2.last_attempt_at DESC NULLS LAST
    LIMIT 1
  );

-- Step 3: Delete duplicate rows, keep only the "winner" per lead_id
DELETE FROM public.lead_enrichments
WHERE id NOT IN (
  SELECT DISTINCT ON (lead_id) id
  FROM public.lead_enrichments
  ORDER BY lead_id, last_attempt_at DESC NULLS LAST
);

-- Step 4: Drop old unique constraint on (lead_id, pipeline)
ALTER TABLE public.lead_enrichments DROP CONSTRAINT IF EXISTS lead_enrichments_lead_id_pipeline_key;
ALTER TABLE public.lead_enrichments DROP CONSTRAINT IF EXISTS unique_lead_pipeline;

-- Step 5: Add new unique constraint on lead_id only
ALTER TABLE public.lead_enrichments ADD CONSTRAINT lead_enrichments_lead_id_key UNIQUE (lead_id);

-- Step 6: Drop the pipeline column
ALTER TABLE public.lead_enrichments DROP COLUMN IF EXISTS pipeline;

-- Step 7: Create partial indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_le_enrich_one ON public.lead_enrichments (lead_id) WHERE enrich_one = false;
CREATE INDEX IF NOT EXISTS idx_le_enrich_two ON public.lead_enrichments (lead_id) WHERE enrich_two = false;
CREATE INDEX IF NOT EXISTS idx_le_enrich_three ON public.lead_enrichments (lead_id) WHERE enrich_three = false;
CREATE INDEX IF NOT EXISTS idx_le_enrich_four ON public.lead_enrichments (lead_id) WHERE enrich_four = false;
CREATE INDEX IF NOT EXISTS idx_le_enrich_five ON public.lead_enrichments (lead_id) WHERE enrich_five = false;
