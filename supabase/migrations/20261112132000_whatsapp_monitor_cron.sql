-- Crons do monitor dos números oficiais (docs/arquitetura/monitor-numeros-whatsapp.md).
-- Mesmo padrão do chakra-refresh-status (jobid 67): chave service_role guardada no Vault.
-- O whatsapp-disponibilidade (jobid 68, :05 de toda hora) continua; o monitor recalcula de novo
-- depois das provas e é quem manda o alerta.

select cron.unschedule(jobname) from cron.job where jobname in ('whatsapp-monitor-trafego', 'whatsapp-monitor-sonda', 'whatsapp-monitor-teste-real');

-- Tráfego: de hora em hora, aos :20 (depois do refresh de status das 10/15/20h UTC e da disponibilidade das :05).
select cron.schedule('whatsapp-monitor-trafego', '20 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/whatsapp-monitor',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"trafego"}'::jsonb, timeout_milliseconds := 120000);
$$);

-- Sonda de permissão: a cada 6 h (0h, 6h, 12h, 18h UTC = 21h, 3h, 9h, 15h em Brasília).
select cron.schedule('whatsapp-monitor-sonda', '40 */6 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/whatsapp-monitor',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"sonda"}'::jsonb, timeout_milliseconds := 120000);
$$);

-- Teste real: dias úteis às 9h de Brasília (12h UTC), só nos números parados há 48 h.
select cron.schedule('whatsapp-monitor-teste-real', '0 12 * * 1-5', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/whatsapp-monitor',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"teste_real"}'::jsonb, timeout_milliseconds := 180000);
$$);
