-- Contas gerais da empresa (reunião 24/09): o financeiro não é só o repasse dos médicos.
-- Aluguel, fornecedor, imposto, serviço, e do outro lado o que a GSS tem a receber fora
-- do contrato. Tudo isso vivia em planilha; aqui vira lançamento com vencimento, baixa e
-- recorrência.
--
-- Os pagamentos de médicos continuam em financeiro_pagamentos: aquele fluxo nasce do
-- fechamento, este nasce da mão. Misturar os dois quebraria o cálculo do repasse.

create table if not exists public.financeiro_contas (
  id                   uuid primary key default gen_random_uuid(),
  tipo                 text not null check (tipo in ('pagar', 'receber')),
  descricao            text not null,
  categoria            text,
  favorecido           text,                      -- fornecedor (pagar) ou cliente (receber)
  documento            text,                      -- nº da NF, boleto, contrato
  valor                numeric(14,2) not null default 0,
  vencimento           date not null,
  mes_referencia       int  not null,
  ano_referencia       int  not null,
  status               text not null default 'aberta' check (status in ('aberta', 'liquidada', 'cancelada')),
  data_liquidacao      date,
  valor_liquidado      numeric(14,2),
  forma_pagamento      text,
  observacoes          text,
  anexo_path           text,
  recorrencia          text not null default 'nenhuma' check (recorrencia in ('nenhuma', 'mensal')),
  recorrencia_ate      date,
  recorrencia_origem_id uuid references public.financeiro_contas(id) on delete set null,
  cliente_id           uuid,
  contrato_id          uuid,
  criado_por           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_fin_contas_comp on public.financeiro_contas(ano_referencia, mes_referencia, tipo);
create index if not exists idx_fin_contas_status on public.financeiro_contas(status);
create index if not exists idx_fin_contas_venc on public.financeiro_contas(vencimento);
create index if not exists idx_fin_contas_origem on public.financeiro_contas(recorrencia_origem_id);

alter table public.financeiro_contas enable row level security;

drop policy if exists "fin contas rw" on public.financeiro_contas;
create policy "fin contas rw" on public.financeiro_contas
  for all to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role));

-- tabela criada por SQL não herda grant: sem isto o app bate em 42501
grant select, insert, update, delete on public.financeiro_contas to authenticated, service_role;

create or replace function public.fin_contas_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- competência sempre derivada do vencimento: evita lançamento que some do filtro do mês
  new.mes_referencia := extract(month from new.vencimento)::int;
  new.ano_referencia := extract(year from new.vencimento)::int;
  return new;
end $$;

drop trigger if exists trg_fin_contas_touch on public.financeiro_contas;
create trigger trg_fin_contas_touch before insert or update on public.financeiro_contas
  for each row execute function public.fin_contas_touch();

comment on table public.financeiro_contas is
  'Contas gerais da empresa (fora do repasse de médicos): a pagar e a receber, com vencimento, baixa e recorrência mensal.';
