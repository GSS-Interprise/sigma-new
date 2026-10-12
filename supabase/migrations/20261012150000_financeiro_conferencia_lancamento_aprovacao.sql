-- Financeiro, etapa 2 (12/10): conferência fiscal da nota, lançamento no Conta Azul,
-- aprovação do pagamento pelo WhatsApp e contas a receber a partir da nota emitida.

-- ── 1. Conferência fiscal da nota do médico ─────────────────────────────────
-- O que a leitura da NFS-e extrai além do valor. Coluna nula = o layout não deixou ler
-- (NÃO é zero); impostos_lidos só é true quando bruto - retenções = líquido na própria nota.
alter table public.financeiro_nf_inbox
  add column if not exists numero_nota      text,
  add column if not exists competencia      date,
  add column if not exists emissao          date,
  add column if not exists valor_liquido    numeric(14,2),
  add column if not exists irrf             numeric(14,2),
  add column if not exists contrib_sociais  numeric(14,2),
  add column if not exists inss_retido      numeric(14,2),
  add column if not exists iss_retido       numeric(14,2),
  add column if not exists total_retencoes  numeric(14,2),
  add column if not exists simples_nacional boolean,
  add column if not exists impostos_lidos   boolean;

-- Resultado da conferência fica no pagamento, que é o que a tela e o lançamento olham.
--   nf_conferencia_status: ok | divergente | manual (não deu para ler) | aceita (exceção aprovada por alguém)
alter table public.financeiro_pagamentos
  add column if not exists nf_numero             text,
  add column if not exists nf_prestador_cnpj     text,
  add column if not exists nf_valor_bruto        numeric(14,2),
  add column if not exists nf_retencoes          numeric(14,2),
  add column if not exists nf_valor_liquido      numeric(14,2),
  add column if not exists nf_conferencia_status text check (nf_conferencia_status in ('ok', 'divergente', 'manual', 'aceita')),
  add column if not exists nf_conferencia        jsonb,
  add column if not exists nf_conferida_em       timestamptz,
  add column if not exists nf_aceita_por         uuid,
  -- ── 2. Lançamento no Conta Azul ──
  add column if not exists ca_evento_id   text,
  add column if not exists ca_parcela_id  text,
  add column if not exists ca_lancado_em  timestamptz,
  add column if not exists ca_lancado_por uuid,
  add column if not exists ca_vencimento  date,
  add column if not exists ca_valor       numeric(14,2),
  add column if not exists ca_payload     jsonb,
  add column if not exists ca_erro        text;

create index if not exists idx_fin_pag_ca_evento on public.financeiro_pagamentos (ca_evento_id) where ca_evento_id is not null;

-- O fechamento conhece a unidade por NOME (vem do relatório de produção); o Conta Azul lança
-- o médico na categoria "MED. unidade". Esta tabela guarda essa escolha, uma vez por unidade.
create table if not exists public.contaazul_unidade_categoria (
  unidade        text primary key,
  categoria_id   text not null,
  categoria_nome text,
  origem         text not null default 'manual' check (origem in ('sugestao', 'manual')),
  definido_por   uuid,
  atualizado_em  timestamptz not null default now()
);
alter table public.contaazul_unidade_categoria enable row level security;
drop policy if exists "ca unidade categoria leitura" on public.contaazul_unidade_categoria;
create policy "ca unidade categoria leitura" on public.contaazul_unidade_categoria for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));
drop policy if exists "ca unidade categoria escrita" on public.contaazul_unidade_categoria;
create policy "ca unidade categoria escrita" on public.contaazul_unidade_categoria for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')))
  with check (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')));
revoke all on public.contaazul_unidade_categoria from anon;
grant select, insert, update, delete on public.contaazul_unidade_categoria to authenticated, service_role;

-- ── 3. Aprovação do pagamento pelo WhatsApp ─────────────────────────────────
-- Um pedido por aprovador e por fechamento. A resposta vale pelo número de quem clicou:
-- só entra aqui telefone cadastrado como aprovador (config financeiro_aprovadores_whatsapp).
create table if not exists public.financeiro_aprovacao_whatsapp (
  id             uuid primary key default gen_random_uuid(),
  fechamento_id  uuid not null references public.financeiro_fechamentos(id) on delete cascade,
  telefone       text not null,
  aprovador_nome text,
  aprovador_id   uuid,
  token          text not null unique,
  wa_message_id  text,
  status         text not null default 'enviado' check (status in ('enviado', 'aprovado', 'nao_aprovado', 'erro', 'substituido')),
  erro           text,
  enviado_em     timestamptz not null default now(),
  respondido_em  timestamptz,
  created_by     uuid
);
create index if not exists idx_fin_aprov_wa_fone on public.financeiro_aprovacao_whatsapp (telefone, status);
create index if not exists idx_fin_aprov_wa_fech on public.financeiro_aprovacao_whatsapp (fechamento_id);
alter table public.financeiro_aprovacao_whatsapp enable row level security;
drop policy if exists "fin aprov wa leitura" on public.financeiro_aprovacao_whatsapp;
create policy "fin aprov wa leitura" on public.financeiro_aprovacao_whatsapp for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));
revoke all on public.financeiro_aprovacao_whatsapp from anon;
grant select on public.financeiro_aprovacao_whatsapp to authenticated;
grant select, insert, update, delete on public.financeiro_aprovacao_whatsapp to service_role;

-- ── 4. Contas a receber a partir da nota emitida pela GSS ───────────────────
-- A nota é emitida no Portal Nacional; aqui entra o arquivo dela. A leitura identifica o
-- cliente pelo CNPJ do tomador e liga ao contrato; o lançamento no Conta Azul é opcional.
create table if not exists public.financeiro_nf_emitidas (
  id               uuid primary key default gen_random_uuid(),
  arquivo_path     text not null,
  arquivo_nome     text,
  chave_acesso     text,
  numero_nota      text,
  emissao          date,
  competencia      date,
  tomador_cnpj     text,
  tomador_nome     text,
  cliente_id       uuid references public.clientes(id),
  contrato_id      uuid references public.contratos(id),
  receber_id       uuid references public.financeiro_receber(id) on delete set null,
  valor_bruto      numeric(14,2),
  total_retencoes  numeric(14,2),
  valor_liquido    numeric(14,2),
  irrf             numeric(14,2),
  contrib_sociais  numeric(14,2),
  inss_retido      numeric(14,2),
  iss_retido       numeric(14,2),
  impostos_lidos   boolean,
  descricao        text,
  vencimento       date,
  status           text not null default 'lida' check (status in ('lida', 'conferir', 'vinculada', 'lancada', 'recebida', 'descartada')),
  motivo           text,
  ca_evento_id     text,
  ca_lancado_em    timestamptz,
  ca_payload       jsonb,
  ca_erro          text,
  recebido_em      date,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- a mesma nota não entra duas vezes: a chave de acesso nacional é única
create unique index if not exists uq_fin_nf_emitidas_chave on public.financeiro_nf_emitidas (chave_acesso) where chave_acesso is not null;
create index if not exists idx_fin_nf_emitidas_contrato on public.financeiro_nf_emitidas (contrato_id, competencia);
alter table public.financeiro_nf_emitidas enable row level security;
drop policy if exists "fin nf emitidas leitura" on public.financeiro_nf_emitidas;
create policy "fin nf emitidas leitura" on public.financeiro_nf_emitidas for select to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));
drop policy if exists "fin nf emitidas escrita" on public.financeiro_nf_emitidas;
create policy "fin nf emitidas escrita" on public.financeiro_nf_emitidas for all to authenticated
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')))
  with check (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')));
revoke all on public.financeiro_nf_emitidas from anon;
grant select, insert, update, delete on public.financeiro_nf_emitidas to authenticated, service_role;
