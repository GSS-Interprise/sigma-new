
-- Inserir token dedicado para o cron (idempotente)
INSERT INTO public.api_tokens (nome, token, ativo)
VALUES ('cron-process-failed-leads-queue', 'c2ede6ad6807cc5aadfd4bc99a4bccd0c5b31fcbb23ef53a232a5bd94d7e9d90', true)
ON CONFLICT DO NOTHING;

-- Reagendar o cron usando o novo token
DO $$
BEGIN
  PERFORM cron.unschedule('process-failed-leads-queue-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-failed-leads-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/process-failed-leads-queue',
    headers := '{"Content-Type": "application/json", "apikey": "c2ede6ad6807cc5aadfd4bc99a4bccd0c5b31fcbb23ef53a232a5bd94d7e9d90"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
