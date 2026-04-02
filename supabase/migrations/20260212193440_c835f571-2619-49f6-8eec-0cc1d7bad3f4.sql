-- Criar cron job para verificar documentos vencidos/próximos do vencimento diariamente às 8h
SELECT cron.schedule(
  'check-document-expiry-daily',
  '0 11 * * *', -- 11:00 UTC = 08:00 BRT
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-document-expiry',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);