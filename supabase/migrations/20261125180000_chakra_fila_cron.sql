-- Worker da fila do webhook da Chakra a cada 30 s (25/11/2026). Doc: docs/arquitetura/chakra-webhook-fila.md.
-- Vem do banco (pg_net), não de outra função: não gasta a cota de chamada entre funções. Cada chamada roda até ~50 s;
-- chamadas sobrepostas não pegam o mesmo evento (SKIP LOCKED) e respeitam o teto de 40 em andamento.
select cron.unschedule('chakra-webhook-fila') where exists (select 1 from cron.job where jobname = 'chakra-webhook-fila');
select cron.schedule('chakra-webhook-fila', '30 seconds', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/chakra-webhook',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sigma-fila', '1',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
