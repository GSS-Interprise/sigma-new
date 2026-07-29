-- A aprovação acontece fora do Sigma. Sincronizar periodicamente evita que a
-- equipe precise clicar em "Sincronizar" para descobrir uma decisão da Meta.
DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'twilio-templates-sync-every-15min';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'twilio-templates-sync-every-15min',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/twilio-content-templates',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-sync-key', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'twilio_internal_sync_key'
        LIMIT 1
      )
    ),
    body := '{"action":"sync"}'::jsonb
  );
  $job$
);

COMMENT ON TABLE public.whatsapp_official_templates IS
  'Templates oficiais sincronizados com a Twilio a cada 15 minutos; a UI operacional exibe somente pt_BR.';
