-- Queda da estação do SLA mais rápida (26/11/2026): o Wagner fechou o PACS da Marieta e o Sigma levou ~20 min para
-- mostrar a estação parada. O sla-alertas agora abre a queda com 2 leituras ruins seguidas (quedaRapida em
-- supabase/functions/_shared/slaEstacao.ts); a checagem do coletor passa de 5 em 5 para 2 em 2 minutos.
select cron.unschedule(jobname) from cron.job where jobname = 'sla-alertas';
select cron.schedule('sla-alertas', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"coletor"}'::jsonb, timeout_milliseconds := 60000);
$$);
