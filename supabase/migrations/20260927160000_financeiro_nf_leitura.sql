-- Leitura da NFS-e e identificação automática do médico (27/09).
--
-- A nota em padrão nacional (DANFSe) traz prestador (CNPJ, nome, e-mail), tomador,
-- descrição e valor. Com isso o sistema decide sozinho: é nota para a GSS? de qual
-- médico? o valor bate com o a pagar? O que não dá para decidir com segurança fica
-- "a confirmar", com o palpite já preenchido.

alter table public.financeiro_nf_inbox
  add column if not exists eh_nfse         boolean,
  add column if not exists tomador_gss     boolean,
  add column if not exists prestador_cnpj  text,
  add column if not exists prestador_nome  text,
  add column if not exists prestador_email text,
  add column if not exists valor_nota      numeric(14,2),
  add column if not exists chave_acesso    text,
  add column if not exists descricao       text,
  add column if not exists medico_id       uuid,
  add column if not exists confianca       text check (confianca in ('forte', 'media', 'fraca')),
  add column if not exists motivo          text;

-- a mesma nota mandada por duas pessoas (aconteceu em 25/09) entra uma vez só
create unique index if not exists uq_fin_nf_inbox_chave
  on public.financeiro_nf_inbox(chave_acesso) where chave_acesso is not null;
create index if not exists idx_fin_nf_inbox_medico on public.financeiro_nf_inbox(medico_id);

-- o sistema aprende: confirmado uma vez que o CNPJ é do médico, a próxima nota daquela
-- empresa entra sozinha. Médico emite pela própria PJ, e o nome da PJ quase nunca é o dele.
create table if not exists public.financeiro_medico_cnpj (
  cnpj        text primary key,
  medico_id   uuid not null references public.medicos(id) on delete cascade,
  razao       text,
  origem      text not null default 'confirmacao',
  created_at  timestamptz not null default now()
);

alter table public.financeiro_medico_cnpj enable row level security;
drop policy if exists "fin medico cnpj rw" on public.financeiro_medico_cnpj;
create policy "fin medico cnpj rw" on public.financeiro_medico_cnpj
  for all to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_financeiro'::app_role) or has_role(auth.uid(), 'diretoria'::app_role));
grant select, insert, update, delete on public.financeiro_medico_cnpj to authenticated, service_role;

-- resposta crua do provedor no envio: o id da mensagem não estava sendo achado, e sem
-- ele não dá para cruzar com os status de entregue/lido que chegam depois
alter table public.financeiro_nf_solicitacoes
  add column if not exists provider_resposta jsonb;
