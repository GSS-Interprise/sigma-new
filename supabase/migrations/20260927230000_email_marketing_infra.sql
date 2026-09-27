-- Infra do e-mail marketing (27/09).

-- Segredos de integração gerados em tempo de execução (ex.: a chave de assinatura do
-- webhook do Resend, devolvida quando o webhook é criado pela API). Sem grant para
-- usuários: só as edge functions, com service role, leem.
create table if not exists public.integracao_segredos (
  nome          text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);
alter table public.integracao_segredos enable row level security;
revoke all on public.integracao_segredos from anon, authenticated;
grant select, insert, update, delete on public.integracao_segredos to service_role;

-- Envio das campanhas de e-mail: a cada 2 minutos manda a próxima leva de cada campanha
-- em andamento (respeitando o limite diário de cada uma). Mesma chave interna do sync de
-- templates, já guardada no vault.
select cron.unschedule('email-marketing-processar-2min')
 where exists (select 1 from cron.job where jobname = 'email-marketing-processar-2min');
select cron.schedule(
  'email-marketing-processar-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/email-campanha',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)
    ),
    body := '{"acao":"processar"}'::jsonb
  );
  $$
);
