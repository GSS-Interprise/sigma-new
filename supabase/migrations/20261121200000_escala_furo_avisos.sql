-- Aviso de furo de escala no WhatsApp (tabela da Ramone, item "Claude GSS: monitoramento do Dr. Escala", 21/11/2026).
-- O Sigma avisa sozinho quem cuida da escala quando aparece furo no Dr. Escala, sem ninguém perguntar.
-- Regras em supabase/functions/_shared/furos.ts; envio pela edge alertas-equipe (acao "furos"), modelo gss_furo_escala_v1.

-- Quem recebe. local_ids null = todos os hospitais.
create table if not exists public.escala_furo_destinos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 80),
  fone text not null check (fone ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'),
  local_ids bigint[],
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists escala_furo_destinos_fone_idx on public.escala_furo_destinos (fone);

-- O que já foi avisado: um aviso por furo, tipo e telefone. Só a edge (service_role) grava.
create table if not exists public.escala_furo_avisos (
  id uuid primary key default gen_random_uuid(),
  plantao_id bigint not null,
  tipo text not null check (tipo in ('novo', 'vespera')),
  fone text not null,
  teste boolean not null default false,
  wamid text,
  enviado_em timestamptz not null default now(),
  unique (plantao_id, tipo, fone)
);
create index if not exists escala_furo_avisos_enviado_idx on public.escala_furo_avisos (enviado_em desc);

grant select, insert, update, delete on public.escala_furo_destinos to authenticated;
grant all on public.escala_furo_destinos to service_role;
grant select on public.escala_furo_avisos to authenticated;
grant all on public.escala_furo_avisos to service_role;

alter table public.escala_furo_destinos enable row level security;
alter table public.escala_furo_avisos enable row level security;

-- Mesmo público que lê as escalas do Dr. Escala (drescala_*): admin, diretoria e coordenador de escalas.
create or replace function public.escala_furo_pode(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(p_uid)
      or public.has_role(p_uid, 'diretoria'::app_role)
      or public.has_role(p_uid, 'coordenador_escalas'::app_role);
$$;
grant execute on function public.escala_furo_pode(uuid) to authenticated;

drop policy if exists escala_furo_destinos_todos on public.escala_furo_destinos;
create policy escala_furo_destinos_todos on public.escala_furo_destinos for all to authenticated
  using (public.escala_furo_pode(auth.uid())) with check (public.escala_furo_pode(auth.uid()));
drop policy if exists escala_furo_avisos_ler on public.escala_furo_avisos;
create policy escala_furo_avisos_ler on public.escala_furo_avisos for select to authenticated
  using (public.escala_furo_pode(auth.uid()));

-- Ligado desde já, mas em teste: tudo vai para o número do Raul até ele liberar (apagar escala_furos_teste_destino).
insert into public.config_lista_items (campo_nome, valor)
select v.campo, v.valor from (values
  ('escala_furos_ativo', 'true'),
  ('escala_furos_teste_destino', '5554984351512')
) v(campo, valor)
where not exists (select 1 from public.config_lista_items c where c.campo_nome = v.campo);

-- Liga, desliga e lê o modo de teste pela tela (config_lista_items não é gravável pela equipe).
create or replace function public.escala_furos_config()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.escala_furo_pode(auth.uid()) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'ativo', coalesce((select valor from config_lista_items where campo_nome = 'escala_furos_ativo'), 'false') = 'true',
    'teste_destino', nullif((select valor from config_lista_items where campo_nome = 'escala_furos_teste_destino'), ''),
    'ultimo_aviso', (select max(enviado_em) from escala_furo_avisos));
end $$;
grant execute on function public.escala_furos_config() to authenticated;

create or replace function public.escala_furos_ligar(p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.escala_furo_pode(auth.uid()) then raise exception 'sem_permissao'; end if;
  update config_lista_items set valor = case when p_ativo then 'true' else 'false' end where campo_nome = 'escala_furos_ativo';
end $$;
grant execute on function public.escala_furos_ligar(boolean) to authenticated;

-- Roda 20 min depois de cada sincronização do Dr. Escala (cron drescala-escalas: 9h, 15h e 21h UTC).
select cron.unschedule(jobname) from cron.job where jobname = 'escala-furos-avisos';
select cron.schedule('escala-furos-avisos', '25 9,15,21 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/alertas-equipe',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"furos"}'::jsonb, timeout_milliseconds := 60000);
$$);
