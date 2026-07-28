-- Recover AI turns killed by an Edge timeout before their catch block runs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'sigzap_outbox_worker_service_role'
  ) THEN
    RAISE EXCEPTION 'Vault secret sigzap_outbox_worker_service_role missing';
  END IF;
END $$;

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
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'sigzap_outbox_worker_service_role'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);
