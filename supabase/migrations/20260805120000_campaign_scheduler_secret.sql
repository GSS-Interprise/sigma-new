-- Troca o scheduler para uma chave interna dedicada. O service role não deve
-- circular em headers de jobs além do estritamente necessário.
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'campanha-disparo-scheduler-every-minute';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'campanha-disparo-scheduler-every-minute',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/campanha-disparo-scheduler',
    headers := jsonb_build_object(
      'x-campaign-scheduler-key', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'campaign_scheduler_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);
