-- T10 e T13 do plano licitacoes-contratos-gss.md (14/10): documentos com vencimento e aviso.
-- Bianca, reunião de 07/10 (01:31:16): certidões e documentos da empresa com validade e alerta por
-- e-mail (afeta a Maria Vitória e a licitação) e os documentos dos médicos com vencimento, "do melhor
-- jeito" (cadastro próprio, sem contorno que gere retrabalho).
--
-- Um robô só (edge vencimentos-alertas, diário) cuida dos dois: avisa no sino e por e-mail, com
-- antecedência e destinatários editáveis na tela (vencimentos_config), um resumo por pessoa por dia.

create table if not exists public.empresa_documentos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'GSS',
  tipo text not null,                    -- CND Federal, FGTS, CNDT, Estadual, Municipal, Falência, Alvará, Balanço, Atestado, Contrato social, Outro
  nome text,                             -- complemento ("Alvará sanitário - matriz")
  emissor text,
  emissao date,
  validade date,                         -- nulo = documento sem vencimento (contrato social, atestado)
  arquivo_path text,                     -- bucket contratos-documentos, pasta empresa/
  arquivo_nome text,
  observacao text,
  substituido_em timestamptz,            -- renovado: a versão antiga fica no histórico e sai dos avisos
  substituido_por uuid references public.empresa_documentos(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_empresa_documentos_vigentes on public.empresa_documentos (validade) where substituido_em is null;

-- quem recebe e com quantos dias de antecedência (editável na tela)
create table if not exists public.vencimentos_config (
  chave text primary key,                -- empresa_documentos | medico_documentos
  dias int[] not null default '{30,15,7,1}',
  destinatarios uuid[] not null default '{}',
  aviso_email boolean not null default true,
  updated_at timestamptz not null default now()
);

-- avisos já enviados: um por documento e marco (dias antes; -1 = vencido)
create table if not exists public.vencimento_avisos (
  origem text not null,
  documento_id uuid not null,
  marco int not null,
  enviado_em timestamptz not null default now(),
  primary key (origem, documento_id, marco)
);

create index if not exists idx_medico_documentos_validade on public.medico_documentos (data_validade) where data_validade is not null;

-- quem cuida de documentos: equipe de licitação/contratos e líderes (Maria Vitória)
create or replace function public.pode_gerir_documentos(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = _uid
                  and role::text in ('admin', 'lider_licitacao', 'licitador', 'gestor_contratos', 'lideres', 'gestor_captacao'));
$$;

alter table public.empresa_documentos enable row level security;
alter table public.vencimentos_config enable row level security;
alter table public.vencimento_avisos enable row level security;

drop policy if exists "Equipe vê documentos da empresa" on public.empresa_documentos;
create policy "Equipe vê documentos da empresa" on public.empresa_documentos for select to authenticated using (true);
drop policy if exists "Equipe cuida dos documentos da empresa" on public.empresa_documentos;
create policy "Equipe cuida dos documentos da empresa" on public.empresa_documentos for all to authenticated
  using (pode_gerir_documentos(auth.uid())) with check (pode_gerir_documentos(auth.uid()));

drop policy if exists "Equipe vê configuração de vencimentos" on public.vencimentos_config;
create policy "Equipe vê configuração de vencimentos" on public.vencimentos_config for select to authenticated using (true);
drop policy if exists "Equipe ajusta configuração de vencimentos" on public.vencimentos_config;
create policy "Equipe ajusta configuração de vencimentos" on public.vencimentos_config for update to authenticated
  using (pode_gerir_documentos(auth.uid())) with check (pode_gerir_documentos(auth.uid()));

grant select, insert, update, delete on public.empresa_documentos to authenticated;
grant select, update on public.vencimentos_config to authenticated;
grant all on public.empresa_documentos, public.vencimentos_config, public.vencimento_avisos to service_role;

create or replace function public.empresa_documentos_upd_trg()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- validade mudou (renovou a data): os avisos valem de novo
  if new.validade is distinct from old.validade then
    delete from vencimento_avisos where origem = 'empresa_documentos' and documento_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_empresa_documentos_upd on public.empresa_documentos;
create trigger trg_empresa_documentos_upd before update on public.empresa_documentos
  for each row execute function public.empresa_documentos_upd_trg();

create or replace function public.medico_documento_validade_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.data_validade is distinct from old.data_validade then
    delete from vencimento_avisos where origem = 'medico_documentos' and documento_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_medico_documento_validade on public.medico_documentos;
create trigger trg_medico_documento_validade before update of data_validade on public.medico_documentos
  for each row execute function public.medico_documento_validade_trg();

-- padrões: certidões → equipe de licitação, gestão de contratos e Maria Vitória (financeiro);
-- documentos de médico → gestão de contratos (quem já recebe o aviso no envio do documento)
insert into public.vencimentos_config (chave, dias, destinatarios)
select 'empresa_documentos', '{30,15,7,1}', coalesce(array_agg(distinct u), '{}') from (
  select user_id u from user_roles where role::text in ('lider_licitacao', 'licitador', 'gestor_contratos')
  union select id from profiles where nome_completo ilike 'Maria Vit%ria%'
) x
on conflict (chave) do nothing;
insert into public.vencimentos_config (chave, dias, destinatarios)
select 'medico_documentos', '{30,15,7}', coalesce(array_agg(distinct user_id), '{}') from user_roles where role::text = 'gestor_contratos'
on conflict (chave) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'vencimentos-alertas';
select cron.schedule('vencimentos-alertas', '0 11 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/vencimentos-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
