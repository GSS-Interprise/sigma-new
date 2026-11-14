-- Protocolo do agente do Sigma, T2 e T3 (docs/arquitetura/protocolo-agente-sigma.md §3e e §3f).
-- T2: mcp_chamadas passa a guardar domínio, versão do protocolo, hash do fato e hora do dado. É o que permite responder
--     "o Claude do Heron disse X e o meu disse Y": mesmo hash = mesmo fato, a diferença foi só de redação.
-- T3: permissão por domínio (papel × domínio). Domínio novo nasce sem papel nenhum até um admin liberar.
-- Teste: supabase/tests/agente_acessos.sql

-- ---- T2: auditoria ---------------------------------------------------------------------------------------
alter table public.mcp_chamadas
  add column if not exists dominio text,
  add column if not exists protocolo_versao text,
  add column if not exists resultado_hash text,
  add column if not exists fonte_atualizada_em timestamptz;

-- A aba de admin filtra por domínio e compara chamadas pelo hash.
create index if not exists mcp_chamadas_dominio_idx on public.mcp_chamadas (dominio, criado_em desc);
create index if not exists mcp_chamadas_hash_idx on public.mcp_chamadas (resultado_hash) where resultado_hash is not null;

-- ---- T3: permissão por domínio ----------------------------------------------------------------------------
create table if not exists public.agente_dominio_acessos (
  papel app_role not null,
  -- Mesmo formato do id do registro (_shared/agente/registro.ts valida /^[a-z]+$/).
  dominio text not null check (dominio ~ '^[a-z]+$'),
  liberado_em timestamptz not null default now(),
  liberado_por uuid,
  primary key (papel, dominio)
);
alter table public.agente_dominio_acessos enable row level security;
drop policy if exists agente_dominio_acessos_ler on public.agente_dominio_acessos;
create policy agente_dominio_acessos_ler on public.agente_dominio_acessos for select to authenticated
  using (public.is_admin(auth.uid()));
grant select on public.agente_dominio_acessos to authenticated;
grant all on public.agente_dominio_acessos to service_role;

-- Semente: o que já valia na T1 (quem entra no MCP, admin e diretoria, vê escalas). Nada muda para quem já usa.
insert into public.agente_dominio_acessos (papel, dominio) values
  ('admin', 'escalas'), ('diretoria', 'escalas')
on conflict do nothing;

-- Domínios liberados para um usuário: união dos papéis dele. Só a edge (service_role) chama.
create or replace function public.agente_dominios_do_usuario(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct a.dominio order by a.dominio), '{}')
  from public.agente_dominio_acessos a
  join public.user_roles r on r.role = a.papel
  where r.user_id = p_user;
$$;
revoke all on function public.agente_dominios_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.agente_dominios_do_usuario(uuid) to service_role;

-- Liga/desliga um domínio para um papel. Só admin (a aba Configurações › Agente do Sigma, T4, chama esta função).
create or replace function public.agente_definir_acesso(p_papel app_role, p_dominio text, p_liberado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not public.is_admin(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_dominio is null or p_dominio !~ '^[a-z]+$' then raise exception 'dominio_invalido: %', p_dominio; end if;
  if p_liberado then
    insert into public.agente_dominio_acessos (papel, dominio, liberado_por)
    values (p_papel, p_dominio, auth.uid())
    on conflict (papel, dominio) do nothing;
  else
    delete from public.agente_dominio_acessos where papel = p_papel and dominio = p_dominio;
  end if;
  return jsonb_build_object('papel', p_papel, 'dominio', p_dominio, 'liberado', p_liberado);
end;
$$;
revoke all on function public.agente_definir_acesso(app_role, text, boolean) from public, anon;
grant execute on function public.agente_definir_acesso(app_role, text, boolean) to authenticated, service_role;
