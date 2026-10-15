-- Aviso de licitação arrematada (pedido da Bianca no WhatsApp, 15/10): "quando entra uma licitação no item
-- ARREMATADOS, ser disparado um aviso para a Ramone/Prospecção e para nós nos contratos". Na mesma conversa
-- ela decidiu manter o médico vinculado só com o contrato lançado (opção 2 da pendência da T8): o aviso
-- antecipa a preparação de todo mundo sem criar contrato antes da assinatura.
--
-- Mesmo caminho dos avisos de contrato: o gatilho põe a licitação na fila e o robô contratos-avisos (a cada
-- 10 min) manda no sino e por e-mail para quem estiver em vencimentos_config.licitacao_arrematada
-- (padrão Ramone, Bianca e Maine; editável na tela de contratos). Só o quadro da GSS.

create table if not exists public.licitacao_arrematada_avisos (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null unique references public.licitacoes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
alter table public.licitacao_arrematada_avisos enable row level security;
grant all on public.licitacao_arrematada_avisos to service_role;

create or replace function public.licitacao_arrematada_aviso_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status::text = 'arrematados' and old.status is distinct from new.status
     and new.board = 'effecti' and not licitacao_eh_ages(new.tipo_licitacao, new.etiquetas) then
    insert into licitacao_arrematada_avisos (licitacao_id) values (new.id)
    on conflict (licitacao_id) do update set criado_em = now(), enviado_em = null;
  end if;
  return new;
end $$;
drop trigger if exists trg_licitacao_arrematada_aviso on public.licitacoes;
create trigger trg_licitacao_arrematada_aviso after update of status on public.licitacoes
  for each row execute function public.licitacao_arrematada_aviso_trg();

insert into public.vencimentos_config (chave, dias, destinatarios)
select 'licitacao_arrematada', '{}', coalesce((select array_agg(id) from profiles where id in (
  'a23cf841-d9f1-4131-905b-765d712c5f80',  -- Ramone
  '5fc86254-ee42-4afb-b9da-c143d68c5995',  -- Bianca
  '77468374-6efb-429e-ac8f-1141a22457e0'   -- Maine
)), '{}')
on conflict (chave) do nothing;

-- o robô contratos-avisos passa a rodar também quando há licitação arrematada na fila
select cron.unschedule(jobid) from cron.job where jobname = 'contratos-avisos';
select cron.schedule('contratos-avisos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contratos-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.contrato_avisos where enviado_em is null)
     or exists (select 1 from public.medico_vinculo_avisos where enviado_em is null)
     or exists (select 1 from public.licitacao_arrematada_avisos where enviado_em is null);
$$);
