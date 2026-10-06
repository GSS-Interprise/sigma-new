-- Leitura inicial do Conta Azul (06/10): cópia local de categorias, centros de custo, contas
-- financeiras e pessoas (fornecedores/clientes), para montar o de-para com o Sigma sem bater
-- na API a cada tela. Só leitura: quem grava é a edge contaazul-oauth, com service role.
create table if not exists public.contaazul_cache (
  tipo          text not null check (tipo in ('categoria', 'centro_custo', 'conta_financeira', 'pessoa')),
  ca_id         text not null,
  nome          text,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (tipo, ca_id)
);
create index if not exists idx_contaazul_cache_nome on public.contaazul_cache (tipo, lower(nome));

alter table public.contaazul_cache enable row level security;

-- dados financeiros da empresa: só financeiro, diretoria e admin enxergam
drop policy if exists "contaazul cache leitura" on public.contaazul_cache;
create policy "contaazul cache leitura" on public.contaazul_cache for select to authenticated
  using (exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));

revoke all on public.contaazul_cache from anon;
grant select on public.contaazul_cache to authenticated;
grant select, insert, update, delete on public.contaazul_cache to service_role;
