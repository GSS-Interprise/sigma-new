-- Módulo de notas fiscais (reunião com a Mavi, 22/09): a etapa mais trabalhosa do
-- financeiro. Cada envio vira registro — quem foi cobrado, por qual canal, quando e
-- com que resultado —, porque hoje esse controle é a conversa arquivada no WhatsApp.
--
-- O `token` é o que permite o médico mandar a nota sem responder e-mail: o link
-- público /nf/<token> sobe o arquivo direto. É o caminho que não depende do MX.

create table if not exists public.financeiro_nf_solicitacoes (
  id                  uuid primary key default gen_random_uuid(),
  pagamento_id        uuid not null references public.financeiro_pagamentos(id) on delete cascade,
  tipo                text not null default 'solicitacao' check (tipo in ('solicitacao', 'lembrete')),
  canal               text not null default 'email' check (canal in ('email', 'whatsapp')),
  destino             text,
  token               text not null unique,
  status              text not null default 'enviada' check (status in ('enviada', 'erro', 'recebida', 'cancelada')),
  erro                text,
  provider_message_id text,
  teste               boolean not null default false,
  enviado_por         uuid,
  created_at          timestamptz not null default now(),
  recebida_em         timestamptz
);

create index if not exists idx_fin_nf_solic_pagamento on public.financeiro_nf_solicitacoes(pagamento_id);
create index if not exists idx_fin_nf_solic_status on public.financeiro_nf_solicitacoes(status);
create index if not exists idx_fin_nf_solic_created on public.financeiro_nf_solicitacoes(created_at desc);

alter table public.financeiro_nf_solicitacoes enable row level security;

drop policy if exists "fin nf solicitacoes rw" on public.financeiro_nf_solicitacoes;
create policy "fin nf solicitacoes rw" on public.financeiro_nf_solicitacoes
  for all to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role));

-- tabela criada por SQL não herda grant: sem isto a edge e o app batem em 42501
grant select, insert, update, delete on public.financeiro_nf_solicitacoes to authenticated, service_role;

alter table public.financeiro_pagamentos
  add column if not exists nf_recebida_em  timestamptz,
  add column if not exists nf_arquivo_path text;

comment on table public.financeiro_nf_solicitacoes is
  'Log de solicitação/cobrança de NF por pagamento. token = link público de upload (/nf/<token>).';
