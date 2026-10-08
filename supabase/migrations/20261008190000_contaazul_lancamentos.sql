-- Espelho das contas a pagar e a receber do Conta Azul (08/10). O Conta Azul é a fonte da
-- verdade; o Sigma só lê e mostra. Colunas tipadas (e não só o jsonb) porque isto alimenta
-- os dashboards do financeiro. Quem grava é a edge contaazul-oauth, com service role.
create table if not exists public.contaazul_lancamentos (
  ca_id             text primary key,
  tipo              text not null check (tipo in ('DESPESA', 'RECEITA')),
  descricao         text,
  status            text,
  status_traduzido  text,
  total             numeric(14,2) not null default 0,
  pago              numeric(14,2) not null default 0,
  nao_pago          numeric(14,2) not null default 0,
  data_vencimento   date,
  data_competencia  date,
  data_criacao      timestamptz,
  data_alteracao    timestamptz,
  -- na conta da GSS todo lançamento tem uma categoria e um centro de custo (sem rateio);
  -- se um dia vier mais de um, o primeiro fica aqui e a lista completa em "dados"
  categoria_id      text,
  categoria_nome    text,
  centro_custo_id   text,
  centro_custo_nome text,
  pessoa_id         text,   -- fornecedor (despesa) ou cliente (receita)
  pessoa_nome       text,
  dados             jsonb not null default '{}'::jsonb,
  sincronizado_em   timestamptz not null default now()
);

create index if not exists idx_ca_lanc_tipo_venc on public.contaazul_lancamentos (tipo, data_vencimento);
create index if not exists idx_ca_lanc_tipo_comp on public.contaazul_lancamentos (tipo, data_competencia);
create index if not exists idx_ca_lanc_categoria on public.contaazul_lancamentos (categoria_id);
create index if not exists idx_ca_lanc_centro on public.contaazul_lancamentos (centro_custo_id);
create index if not exists idx_ca_lanc_pessoa on public.contaazul_lancamentos (pessoa_id);
create index if not exists idx_ca_lanc_status on public.contaazul_lancamentos (status);

alter table public.contaazul_lancamentos enable row level security;

-- dados financeiros da empresa: só financeiro, diretoria e admin enxergam
drop policy if exists "contaazul lancamentos leitura" on public.contaazul_lancamentos;
create policy "contaazul lancamentos leitura" on public.contaazul_lancamentos for select to authenticated
  using (exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));

revoke all on public.contaazul_lancamentos from anon;
grant select on public.contaazul_lancamentos to authenticated;
grant select, insert, update, delete on public.contaazul_lancamentos to service_role;
