-- SLA de laudos: aviso de coletor parado. Sem leitura "ok" da estação há mais de 15 min, ninguém está vendo a fila
-- (PC desligado, VPN caída, PACS fechado, tela bloqueada, túnel ou internet). Um registro por queda: o e-mail sai
-- quando cai e quando volta, nunca a cada 5 min.
create table if not exists public.sla_coletor_quedas (
  id bigint generated always as identity primary key,
  unidade text not null,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  ultima_ok_em timestamptz,
  motivo text
);
create unique index if not exists sla_coletor_quedas_aberta on public.sla_coletor_quedas (unidade) where fechada_em is null;
alter table public.sla_coletor_quedas enable row level security;
drop policy if exists sla_coletor_quedas_ler on public.sla_coletor_quedas;
create policy sla_coletor_quedas_ler on public.sla_coletor_quedas for select to authenticated using (true);
grant select on public.sla_coletor_quedas to authenticated;
grant all on public.sla_coletor_quedas to service_role;

select cron.unschedule(jobname) from cron.job where jobname = 'sla-alertas';
select cron.schedule('sla-alertas', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"coletor"}'::jsonb, timeout_milliseconds := 60000);
$$);
