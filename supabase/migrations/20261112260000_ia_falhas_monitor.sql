-- Fase 8.1: monitor de falhas da IA das campanhas (alertas-equipe, ação ia_falhas), a cada 15 min.
select cron.unschedule(jobname) from cron.job where jobname = 'ia-falhas-monitor';
select cron.schedule('ia-falhas-monitor', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/alertas-equipe',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"ia_falhas"}'::jsonb, timeout_milliseconds := 60000);
$$);
