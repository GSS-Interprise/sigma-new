-- Captação GSS pela API do Effecti a cada 30 minutos, das 06:00 às 20:30 (Brasília).
-- Cada rodada: avisos dos últimos 2 dias do perfil GSS (cards novos ou com data alterada) e,
-- se sobrar tempo, até 8 anexos da fila. A AGES segue no captador próprio, sem mudança.
select cron.unschedule(jobid) from cron.job where jobname = 'effecti-captacao-gss';
select cron.schedule('effecti-captacao-gss', '*/30 9-23 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/effecti-captacao',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{"acao":"rodada","dias":2}'::jsonb, timeout_milliseconds := 150000);
$$);
