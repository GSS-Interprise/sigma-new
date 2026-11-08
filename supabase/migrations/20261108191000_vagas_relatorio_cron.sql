-- Relatório de vagas em aberto às 7h (BRT) nos dias úteis: e-mail aos sócios + WhatsApp oficial ao Maikon.
select cron.unschedule(jobid) from cron.job where jobname = 'vagas-relatorio-diario';

select cron.schedule('vagas-relatorio-diario', '0 10 * * 1-5', $cron$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/vagas-relatorio-diario',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"modo":"enviar"}'::jsonb, timeout_milliseconds := 120000);
$cron$);
