-- Detalhe diário dos lançamentos novos ou alterados do Conta Azul (06:20 BRT), logo depois
-- do espelho. Mantém valor bruto, impostos retidos e a divisão por categoria em dia.
select cron.unschedule(jobid) from cron.job where jobname = 'contaazul-espelho-detalhe-diario';

select cron.schedule('contaazul-espelho-detalhe-diario', '20 9 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contaazul-oauth',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{"acao":"detalhar_lancamentos","limite":120}'::jsonb, timeout_milliseconds := 140000);
$$);
