-- Use a dedicated encrypted key because the legacy worker service-role secret
-- may differ from the current Edge runtime key after credential rotation.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'campanha-ia-recovery-every-5min';

SELECT cron.schedule(
  'campanha-ia-recovery-every-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.functions.supabase.co/campanha-ia-recovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-recovery-key', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'campanha_ia_recovery_internal_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
