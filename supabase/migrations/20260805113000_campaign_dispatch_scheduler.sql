-- Scheduler resiliente das campanhas de prospecção.
-- O processor continua responsável por lock, janela, limite e idempotência.
-- O job apenas acorda campanhas elegíveis a cada minuto.

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
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'sigzap_outbox_worker_service_role'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);

COMMENT ON FUNCTION public.processar_disparos_agendados() IS
  'Legado: o disparo de campanhas de prospecção usa campanha-disparo-scheduler-every-minute.';
