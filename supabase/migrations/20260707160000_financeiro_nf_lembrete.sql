-- Lembretes de NF (07/07): controle de reenvio pra médicos que não enviaram a NF.
-- Cron diário chama a edge financeiro-nf-lembrete (reenvia a cada ~48h, teto 3, e
-- notifica a equipe do financeiro com quem está pendente).
alter table public.financeiro_pagamentos
  add column if not exists nf_lembretes int not null default 0,
  add column if not exists nf_ultimo_lembrete_em timestamptz;

do $$ begin
  perform cron.unschedule('financeiro-nf-lembrete-diario');
exception when others then null; end $$;

select cron.schedule('financeiro-nf-lembrete-diario', '0 13 * * *', $cron$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/financeiro-nf-lembrete',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$cron$);
