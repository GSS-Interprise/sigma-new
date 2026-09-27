-- Caixa de entrada das notas que chegam pelo WhatsApp (27/09).
--
-- Entre 25 e 26/09 oito médicos mandaram NF para o número do financeiro e NENHUMA foi
-- guardada: o telefone do remetente quase nunca é o que está no cadastro (médico manda
-- do celular pessoal, do escritório, da contabilidade). Ignorar o que não casa é perder
-- nota — o arquivo do WhatsApp expira em poucos dias.
--
-- Então tudo que chega é guardado aqui primeiro. O que casa com um pagamento é vinculado
-- na hora; o resto fica pendente para a equipe vincular em dois cliques.

create table if not exists public.financeiro_nf_inbox (
  id             uuid primary key default gen_random_uuid(),
  origem         text not null default 'whatsapp' check (origem in ('whatsapp', 'email', 'manual')),
  remetente      text,                       -- telefone (E.164) ou e-mail de quem mandou
  remetente_nome text,                       -- nome do perfil no WhatsApp
  arquivo_nome   text,
  arquivo_path   text not null,
  mime           text,
  mensagem_id    text unique,                -- id da mensagem no provedor: evita duplicar
  recebido_em    timestamptz not null default now(),
  status         text not null default 'pendente' check (status in ('pendente', 'vinculada', 'descartada')),
  pagamento_id   uuid references public.financeiro_pagamentos(id) on delete set null,
  vinculado_por  uuid,
  vinculado_em   timestamptz,
  observacoes    text
);

create index if not exists idx_fin_nf_inbox_status on public.financeiro_nf_inbox(status, recebido_em desc);
create index if not exists idx_fin_nf_inbox_remetente on public.financeiro_nf_inbox(remetente);

alter table public.financeiro_nf_inbox enable row level security;

drop policy if exists "fin nf inbox rw" on public.financeiro_nf_inbox;
create policy "fin nf inbox rw" on public.financeiro_nf_inbox
  for all to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role));

grant select, insert, update, delete on public.financeiro_nf_inbox to authenticated, service_role;

comment on table public.financeiro_nf_inbox is
  'Notas recebidas pelo WhatsApp/e-mail antes de virarem anexo de um pagamento. O que não casa pelo telefone fica pendente para vínculo manual.';
