-- Add missing enum value used by Kanban column "Conferência"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'status_licitacao'
      AND e.enumlabel = 'conferencia'
  ) THEN
    ALTER TYPE public.status_licitacao ADD VALUE 'conferencia' AFTER 'edital_analise';
  END IF;
END $$;