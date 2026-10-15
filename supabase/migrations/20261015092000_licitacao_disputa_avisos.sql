-- Aviso da própria data da disputa (revisão da reunião de 07/10, Bianca 37:17: o Trello avisava 1 dia e
-- 1 hora antes da disputa). O robô licitacoes-tarefas-alertas grava aqui o que já avisou; a chave tem a
-- data da disputa, então disputa remarcada avisa de novo.
create table if not exists public.licitacao_disputa_avisos (
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  data_disputa timestamptz not null,
  user_id uuid not null,
  antecedencia_min int not null,
  email_enviado boolean not null default false,
  enviado_em timestamptz not null default now(),
  primary key (licitacao_id, data_disputa, user_id, antecedencia_min)
);
alter table public.licitacao_disputa_avisos enable row level security;
grant all on public.licitacao_disputa_avisos to service_role;
