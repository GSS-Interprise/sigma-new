-- Cobertura contínua dos insights: roda o batch do extrator a cada 2h.
-- Usa current_setting (padrão seguro do projeto) — sem secret literal no cron.job.
select cron.schedule('perfil-extrator-batch-2h', '0 */2 * * *', $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/lead-perfil-extrator-batch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('limite', 15)
  );
$$);
