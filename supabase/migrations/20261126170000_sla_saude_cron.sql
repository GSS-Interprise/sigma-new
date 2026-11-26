-- Saúde do SLA (26/11/2026): a cada 30 min o sla-alertas (ação "saude") procura avisos que não chegaram, exame vencido
-- sem nenhum aviso entregue, modalidade sem ninguém na escala e plantonista sem telefone, e avisa a equipe (mesma lista
-- e período do aviso de estação) e o e-mail da coordenação. Mesmo problema só repete depois de 3 h.
insert into public.config_lista_items (campo_nome, valor)
select 'sla_saude_avisos', '{}' where not exists (select 1 from public.config_lista_items where campo_nome = 'sla_saude_avisos');
select cron.unschedule(jobname) from cron.job where jobname = 'sla-saude';
select cron.schedule('sla-saude', '*/30 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"saude"}'::jsonb, timeout_milliseconds := 60000);
$$);
