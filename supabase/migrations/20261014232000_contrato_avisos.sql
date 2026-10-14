-- T9 do plano licitacoes-contratos-gss.md (14/10): avisos de contrato assinado e de início do serviço.
-- Bianca, reunião de 07/10 (01:15:57): contrato assinado avisa a Maria Vitória (financeiro) e o
-- operacional; segundo aviso quando o serviço começa (hora de faturar). A Ramone queria ligar o
-- início à primeira escala, mas a escala hoje aponta para o contrato do médico, não para o do
-- cliente (falta o mapeamento Dr. Escala → contrato). Até lá o início é marcado na lista de contratos.
-- Destinatários editáveis na tela (vencimentos_config, chaves contrato_assinado e
-- contrato_inicio_servico); padrão Maria Vitória até a Ramone definir o operacional.

alter table public.contratos add column if not exists servico_iniciado_em date;

create table if not exists public.contrato_avisos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  evento text not null,                     -- assinado | inicio_servico
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (contrato_id, evento)
);
alter table public.contrato_avisos enable row level security;
drop policy if exists "Equipe vê avisos de contrato" on public.contrato_avisos;
create policy "Equipe vê avisos de contrato" on public.contrato_avisos for select to authenticated using (true);
grant select on public.contrato_avisos to authenticated;
grant all on public.contrato_avisos to service_role;

create or replace function public.contrato_avisos_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.status_contrato, '') = 'Pre-Contrato' then return new; end if;
  -- só na mudança (os 97 contratos já assinados antes de 14/10 não disparam)
  if new.assinado::text = 'Sim' and (tg_op = 'INSERT' or old.assinado::text is distinct from 'Sim') then
    insert into contrato_avisos (contrato_id, evento) values (new.id, 'assinado') on conflict do nothing;
  end if;
  if new.servico_iniciado_em is not null and (tg_op = 'INSERT' or old.servico_iniciado_em is null) then
    insert into contrato_avisos (contrato_id, evento) values (new.id, 'inicio_servico') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_contrato_avisos on public.contratos;
create trigger trg_contrato_avisos after insert or update of assinado, servico_iniciado_em, status_contrato on public.contratos
  for each row execute function public.contrato_avisos_trg();

insert into public.vencimentos_config (chave, dias, destinatarios)
select k, '{}', coalesce((select array_agg(id) from profiles where nome_completo ilike 'Maria Vit%ria%'), '{}')
  from unnest(array['contrato_assinado', 'contrato_inicio_servico']) k
on conflict (chave) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'contratos-avisos';
select cron.schedule('contratos-avisos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contratos-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.contrato_avisos where enviado_em is null);
$$);
