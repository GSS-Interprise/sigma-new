-- O Postgres hospedado nao expoe app.settings.service_role_key. A credencial do
-- worker fica criptografada no Vault e so e desencriptada dentro do cron.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'sigzap_outbox_worker_service_role'
  ) THEN
    RAISE EXCEPTION 'Vault secret sigzap_outbox_worker_service_role ausente';
  END IF;
END $$;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sigzap-outbox-worker-every-minute';

SELECT cron.schedule(
  'sigzap-outbox-worker-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.functions.supabase.co/sigzap-outbox-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'sigzap_outbox_worker_service_role'
        LIMIT 1
      )
    ),
    -- Uma mensagem por minuto respeita o cooldown antiban e mantem a execucao
    -- abaixo do limite da Edge Function.
    body := '{"limit":1}'::jsonb
  );
  $cron$
);
