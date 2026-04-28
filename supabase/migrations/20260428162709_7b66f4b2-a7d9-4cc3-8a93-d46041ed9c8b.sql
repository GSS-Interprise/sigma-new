
-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover job se já existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('process-failed-leads-queue-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Agendar job a cada minuto
SELECT cron.schedule(
  'process-failed-leads-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/process-failed-leads-queue',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQwODEsImV4cCI6MjA5MDczMDA4MX0.BKhpdlsDdH13j9pJYwZgvuOeBS10DDH5GehQ3efpqkw", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQwODEsImV4cCI6MjA5MDczMDA4MX0.BKhpdlsDdH13j9pJYwZgvuOeBS10DDH5GehQ3efpqkw"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Resetar itens antigos com erro de schema (api_enrich_status) para serem reprocessados
UPDATE public.import_leads_failed_queue
SET status = 'pending',
    attempts = 0,
    next_retry_at = now(),
    error_code = NULL,
    error_message = NULL
WHERE status = 'pending'
  AND error_code = '42703';

-- Resetar itens órfãos em 'processing' (de execuções anteriores que travaram)
UPDATE public.import_leads_failed_queue
SET status = 'pending',
    next_retry_at = now()
WHERE status = 'processing';
