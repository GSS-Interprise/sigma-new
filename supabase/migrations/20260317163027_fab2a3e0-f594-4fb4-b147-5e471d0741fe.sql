
-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'import_leads_failed_queue'
      AND column_name = 'abandonment_reason'
  ) THEN
    ALTER TABLE public.import_leads_failed_queue
      ADD COLUMN abandonment_reason text;
  END IF;
END;
$$;

-- Index para facilitar diagnóstico por razão de abandono
CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE status = 'abandoned';

-- Index composto para o cron: busca por pending + next_retry_at
CREATE INDEX IF NOT EXISTS idx_failed_queue_pending_retry
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';
