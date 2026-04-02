
CREATE TABLE public.import_leads_failed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  resolved_at timestamptz,
  lead_id uuid
);

CREATE INDEX idx_import_leads_failed_queue_status_retry 
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.import_leads_failed_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to failed queue"
  ON public.import_leads_failed_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);
