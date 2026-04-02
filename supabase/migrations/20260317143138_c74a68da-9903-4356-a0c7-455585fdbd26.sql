
-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue
ALTER TABLE public.import_leads_failed_queue
  ADD COLUMN IF NOT EXISTS abandonment_reason text;

COMMENT ON COLUMN public.import_leads_failed_queue.abandonment_reason IS 
  'Motivo do abandono: invalid_payload | phone_conflict_unresolvable | lead_not_found | max_retries_exceeded | timeout | unknown_error';

CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason 
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE abandonment_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_queue_retry_scan
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';
