-- Motor de alertas ao médico (sla-alertas, ação "exames"), a cada 2 min. Só manda alguma coisa com
-- config_lista_items.sla_alertas_ativo = 'true' (ligar depois da escala preenchida e dos modelos aprovados).
insert into public.config_lista_items (campo_nome, valor)
select 'sla_alertas_ativo', 'false' where not exists (select 1 from public.config_lista_items where campo_nome = 'sla_alertas_ativo');

select cron.unschedule(jobname) from cron.job where jobname = 'sla-alertas-exames';
select cron.schedule('sla-alertas-exames', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"exames"}'::jsonb, timeout_milliseconds := 120000);
$$);
