-- T08 (parcial / "meio pronto") Módulo Financeiro (06/07): contas a RECEBER a partir
-- dos contratos ativos. Estrutura + RPC de sync idempotente por competência. As regras
-- finas de faturamento (fixo/hora/produção) ficam em `condicao_pagamento` (copiado do
-- contrato) pra refinar depois; valor vem de `contratos.valor_estimado`.

create table if not exists public.financeiro_receber (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid references public.contratos(id) on delete set null,
  cliente_id uuid,
  mes_referencia int not null,
  ano_referencia int not null,
  descricao text,
  condicao_pagamento text,                       -- copiado do contrato (regra a refinar)
  valor_previsto numeric not null default 0,     -- de contratos.valor_estimado
  valor_faturado numeric,
  status text not null default 'a_faturar',      -- a_faturar | faturado | recebido
  nf_saida_status text not null default 'pendente', -- pendente | emitida
  data_prevista date,
  observacoes text,
  fonte text not null default 'contrato',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, mes_referencia, ano_referencia)
);
create index if not exists idx_fin_receber_comp on public.financeiro_receber (ano_referencia, mes_referencia, status);

alter table public.financeiro_receber enable row level security;

drop policy if exists "Financeiro roles read receber" on public.financeiro_receber;
create policy "Financeiro roles read receber" on public.financeiro_receber
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

drop policy if exists "Financeiro roles manage receber" on public.financeiro_receber;
create policy "Financeiro roles manage receber" on public.financeiro_receber
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

grant select, insert, update, delete on public.financeiro_receber to authenticated, service_role;

-- Sync idempotente: gera as linhas "a_faturar" do mês a partir dos contratos ativos
-- vigentes na competência. NÃO sobrescreve linhas já existentes (edições manuais).
create or replace function public.sync_financeiro_receber(p_mes int, p_ano int)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_ins int := 0;
  v_ini date := make_date(p_ano, p_mes, 1);
  v_fim date := (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date;
begin
  insert into public.financeiro_receber(contrato_id, cliente_id, mes_referencia, ano_referencia, descricao, condicao_pagamento, valor_previsto, data_prevista, fonte)
  select c.id, c.cliente_id, p_mes, p_ano,
    coalesce('Contrato ' || c.codigo_contrato, 'Contrato') || coalesce(' — ' || nullif(cl.nome_fantasia, ''), coalesce(' — ' || nullif(cl.nome_empresa, ''), '')),
    c.condicao_pagamento, coalesce(c.valor_estimado, 0), v_fim, 'contrato'
  from public.contratos c
  left join public.clientes cl on cl.id = c.cliente_id
  where c.status_contrato = 'Ativo'
    and c.data_inicio <= v_fim
    and (c.data_fim is null or c.data_fim >= v_ini)
    and (c.data_termino is null or c.data_termino >= v_ini)
  on conflict (contrato_id, mes_referencia, ano_referencia) do nothing;
  get diagnostics v_ins = row_count;
  return jsonb_build_object('inseridos', v_ins, 'competencia', to_char(v_ini, 'MM/YYYY'));
end $fn$;

grant execute on function public.sync_financeiro_receber(int, int) to authenticated, service_role;
