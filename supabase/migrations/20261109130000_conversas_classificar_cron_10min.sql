-- Gemini no plano gratuito tem limite por minuto: rodadas menores e mais frequentes (40 a cada 10 min).
-- Com a fila vazia a rodada só consulta a RPC e sai.
select cron.unschedule(jobid) from cron.job where jobname = 'conversas-classificar';

select cron.schedule('conversas-classificar', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/conversas-classificar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"limite":40}'::jsonb, timeout_milliseconds := 150000);
$cron$);
