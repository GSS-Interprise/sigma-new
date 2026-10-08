-- Atualização diária do espelho do Conta Azul (06:10 BRT): listas (categorias, centros de
-- custo, contas, pessoas) e lançamentos da janela móvel (mês anterior até dois meses à frente).
-- Usa a mesma chave interna dos outros crons do financeiro, lida do vault.
select cron.unschedule(jobid) from cron.job where jobname in ('contaazul-espelho-listas-diario', 'contaazul-espelho-lancamentos-diario');

select cron.schedule('contaazul-espelho-listas-diario', '10 9 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contaazul-oauth',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{"acao":"sincronizar"}'::jsonb, timeout_milliseconds := 120000);
$$);

select cron.schedule('contaazul-espelho-lancamentos-diario', '15 9 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contaazul-oauth',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{"acao":"sincronizar_lancamentos"}'::jsonb, timeout_milliseconds := 120000);
$$);
