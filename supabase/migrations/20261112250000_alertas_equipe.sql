-- Avisos à equipe comercial (alertas-equipe): médico quente na hora e resumo diário dos interessados, só WhatsApp
-- oficial pelo 9713-2474. Começa em 16/11 (Raul, 12/11). Destinatários: "Nome:55DDDNUMERO; Nome:55..." (a preencher).
insert into public.config_lista_items (campo_nome, valor)
select v.campo, v.valor from (values
  ('alertas_equipe_sender_id', '2ab7e808-fec9-4b84-8340-d4d96df742a8'),
  ('alertas_equipe_inicio', '2026-11-16'),
  ('alertas_equipe_destinos', '')
) v(campo, valor)
where not exists (select 1 from public.config_lista_items c where c.campo_nome = v.campo);

-- Resumo diário às 18h de Brasília (21h UTC).
select cron.unschedule(jobname) from cron.job where jobname = 'alertas-equipe-resumo';
select cron.schedule('alertas-equipe-resumo', '0 21 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/alertas-equipe',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"resumo"}'::jsonb, timeout_milliseconds := 60000);
$$);
