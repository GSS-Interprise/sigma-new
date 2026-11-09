-- Classificação das conversas de campanha (Fase 7.2) a cada 2 h, 200 por rodada.
-- Sem crédito na OpenAI a edge para no primeiro erro de saldo e não grava nada.
select cron.unschedule(jobid) from cron.job where jobname = 'conversas-classificar';

select cron.schedule('conversas-classificar', '15 */2 * * *', $cron$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/conversas-classificar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"limite":200}'::jsonb, timeout_milliseconds := 300000);
$cron$);
