
-- Agendar sweeper de sem_resposta a cada 15 minutos
SELECT cron.unschedule('sweeper-acompanhamento-sem-resposta')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweeper-acompanhamento-sem-resposta');

SELECT cron.schedule(
  'sweeper-acompanhamento-sem-resposta',
  '*/15 * * * *',
  $$ SELECT public.sweeper_acompanhamento_sem_resposta(); $$
);
