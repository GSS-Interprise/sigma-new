-- Cron job para processar campanhas de disparo agendadas (limite 120/dia atingido)
-- Roda diariamente às 11:05 UTC = 08:05 BRT (5min após o horário de envio para evitar race condition)

-- Função que busca campanhas agendadas e chama a Edge Function para cada uma
CREATE OR REPLACE FUNCTION public.processar_disparos_agendados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  base_url TEXT;
  service_key TEXT;
BEGIN
  base_url := current_setting('app.settings.supabase_url');
  service_key := current_setting('app.settings.service_role_key');

  FOR r IN
    SELECT id
    FROM public.disparos_campanhas
    WHERE status = 'agendado'
      AND proximo_envio <= now()
      AND ativo = true
  LOOP
    PERFORM net.http_post(
      url := base_url || '/functions/v1/disparos-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'campanha_id', r.id,
        'acao', 'iniciar'
      )
    );

    RAISE LOG '[processar_disparos_agendados] Disparado iniciar para campanha %', r.id;
  END LOOP;
END;
$$;

-- Agendar cron: todo dia às 08:05 BRT (11:05 UTC)
SELECT cron.schedule(
  'processar-disparos-agendados',
  '5 11 * * *',
  $$SELECT public.processar_disparos_agendados();$$
);
