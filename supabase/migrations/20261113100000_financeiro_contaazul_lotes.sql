-- Lote do lançamento no Conta Azul (13/11/2026). Maria: Arthur Blois estava no fechamento e cadastrado no Conta
-- Azul, mas não foi lançado com os outros, e o Sigma não avisou. A cada envio, a edge financeiro-conta-azul
-- confere o fechamento da competência inteiro (liberado e com valor a pagar) contra o que tem id do Conta Azul
-- e grava aqui quem ficou de fora e por quê. completo = false enquanto faltar alguém.
-- Só aditiva: nenhuma coluna existente muda; o encerramento do mês (fin_fechamento_reavaliar) segue igual.
create table if not exists public.financeiro_contaazul_lotes (
  id              uuid primary key default gen_random_uuid(),
  mes_referencia  int not null,
  ano_referencia  int not null,
  fechamento_id   uuid references public.financeiro_fechamentos(id) on delete set null,
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  enviados        int not null default 0,   -- pagamentos neste envio
  lancados        int not null default 0,   -- confirmados pelo Conta Azul neste envio
  erros           int not null default 0,
  esperados       int not null default 0,   -- do fechamento inteiro da competência
  confirmados     int not null default 0,
  completo        boolean not null default false,
  pendentes       jsonb not null default '[]'::jsonb,  -- [{pagamento_id, medico, unidade, tipo, motivo}]
  resultados      jsonb not null default '[]'::jsonb   -- resposta por pagamento deste envio
);

create index if not exists idx_fin_ca_lotes_competencia
  on public.financeiro_contaazul_lotes (ano_referencia, mes_referencia, criado_em desc);

alter table public.financeiro_contaazul_lotes enable row level security;
drop policy if exists "ca lotes leitura" on public.financeiro_contaazul_lotes;
create policy "ca lotes leitura" on public.financeiro_contaazul_lotes for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));
-- só a edge (service role) grava: o registro é a prova do que aconteceu no envio
revoke all on public.financeiro_contaazul_lotes from anon, authenticated;
grant select on public.financeiro_contaazul_lotes to authenticated;
grant all on public.financeiro_contaazul_lotes to service_role;
