-- Add new status 'suspenso_revogado' to the status_licitacao enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'status_licitacao'
      AND e.enumlabel = 'suspenso_revogado'
  ) THEN
    ALTER TYPE public.status_licitacao ADD VALUE 'suspenso_revogado' AFTER 'descarte_edital';
  END IF;
END $$;