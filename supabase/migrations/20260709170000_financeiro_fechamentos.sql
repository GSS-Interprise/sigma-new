-- Bloco 2 (fechar módulo financeiro) — Fluxo de aprovação Mavi → João → Thais.
-- Fechamento mensal (lote) que a Mavi fecha, o João aprova e a Thais paga.

-- Fechamento do mês (o "lote" que o João aprova).
create table if not exists public.financeiro_fechamentos (
  id uuid primary key default gen_random_uuid(),
  mes_referencia int not null,
  ano_referencia int not null,
  status text not null default 'aguardando_aprovacao', -- aguardando_aprovacao | aprovado | pago | cancelado
  total numeric not null default 0,
  qtd_medicos int not null default 0,
  pdf_path text,                          -- PDF consolidado (bucket financeiro-anexos)
  observacoes text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  aprovado_por uuid,
  aprovado_em timestamptz,
  canal_msg_id uuid,                      -- mensagem postada no canal de aprovação
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mes_referencia, ano_referencia)
);
create index if not exists idx_fin_fechamentos_status on public.financeiro_fechamentos (status, ano_referencia, mes_referencia);

alter table public.financeiro_fechamentos enable row level security;
drop policy if exists "Financeiro le fechamentos" on public.financeiro_fechamentos;
create policy "Financeiro le fechamentos" on public.financeiro_fechamentos
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));
drop policy if exists "Financeiro gerencia fechamentos" on public.financeiro_fechamentos;
create policy "Financeiro gerencia fechamentos" on public.financeiro_fechamentos
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));
grant select, insert, update, delete on public.financeiro_fechamentos to authenticated, service_role;

-- Vincula os pagamentos do médico ao fechamento do mês.
alter table public.financeiro_pagamentos
  add column if not exists fechamento_id uuid references public.financeiro_fechamentos(id) on delete set null;
create index if not exists idx_fin_pag_fechamento on public.financeiro_pagamentos (fechamento_id);

-- Fila de comprovantes que o sistema NÃO conseguiu casar automaticamente ao médico
-- (a Thais resolve na mão). Arquivo no bucket privado financeiro-anexos.
create table if not exists public.financeiro_comprovantes_pendentes (
  id uuid primary key default gen_random_uuid(),
  arquivo_path text not null,
  arquivo_nome text,
  mime text,
  texto_extraido text,                    -- texto lido do PDF (p/ a Thais casar na mão)
  candidatos jsonb,                        -- possíveis médicos (nome/score) que o sistema achou
  motivo text,                            -- por que não casou (ex.: 'nome nao encontrado', 'ambiguo')
  resolvido boolean not null default false,
  pagamento_id uuid references public.financeiro_pagamentos(id) on delete set null,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_comp_pend on public.financeiro_comprovantes_pendentes (resolvido, created_at);

alter table public.financeiro_comprovantes_pendentes enable row level security;
drop policy if exists "Financeiro le comprovantes pendentes" on public.financeiro_comprovantes_pendentes;
create policy "Financeiro le comprovantes pendentes" on public.financeiro_comprovantes_pendentes
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));
drop policy if exists "Financeiro gerencia comprovantes pendentes" on public.financeiro_comprovantes_pendentes;
create policy "Financeiro gerencia comprovantes pendentes" on public.financeiro_comprovantes_pendentes
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));
grant select, insert, update, delete on public.financeiro_comprovantes_pendentes to authenticated, service_role;
