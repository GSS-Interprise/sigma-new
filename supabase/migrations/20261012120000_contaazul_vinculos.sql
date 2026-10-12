-- Ligação entre contrato do Sigma e os cadastros do Conta Azul (12/10). Não existe chave comum
-- entre os dois sistemas: o Conta Azul identifica o contrato por NOME (categoria "MED. unidade"
-- na despesa, centro de custo "CLIENTE/UF - CT nº" na receita). Esta tabela guarda a ligação,
-- com o contrato do Sigma como chave mestra, para os painéis financeiros e para o lançamento.
--   tipo = cliente            → pessoa do Conta Azul (casada pelo CNPJ, automática)
--   tipo = categoria_despesa  → categoria "MED. ..." onde caem os pagamentos de médico do contrato
--   tipo = centro_receita     → centro de custo usado nas receitas do contrato
-- Um contrato pode ter várias categorias (hospital dividido por serviço) e uma categoria pode
-- servir a mais de um contrato, por isso a chave é (contrato, tipo, ca_id).
create table if not exists public.contaazul_vinculos (
  id             uuid primary key default gen_random_uuid(),
  contrato_id    uuid not null references public.contratos(id) on delete cascade,
  tipo           text not null check (tipo in ('cliente', 'categoria_despesa', 'centro_receita')),
  ca_id          text not null,
  ca_nome        text,
  origem         text not null check (origem in ('cnpj', 'sugestao_nome', 'sugestao_numero', 'manual')),
  status         text not null default 'sugerido' check (status in ('sugerido', 'confirmado', 'rejeitado')),
  confianca      text check (confianca in ('alta', 'baixa')),
  confirmado_por uuid,
  confirmado_em  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (contrato_id, tipo, ca_id)
);
create index if not exists idx_ca_vinc_ca on public.contaazul_vinculos (tipo, ca_id);
create index if not exists idx_ca_vinc_status on public.contaazul_vinculos (status);

alter table public.contaazul_vinculos enable row level security;

drop policy if exists "contaazul vinculos leitura" on public.contaazul_vinculos;
create policy "contaazul vinculos leitura" on public.contaazul_vinculos for select to authenticated
  using (exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')));

drop policy if exists "contaazul vinculos escrita" on public.contaazul_vinculos;
create policy "contaazul vinculos escrita" on public.contaazul_vinculos for all to authenticated
  using (exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')))
  with check (exists (select 1 from public.user_roles r
                  where r.user_id = auth.uid() and r.role::text in ('admin', 'gestor_financeiro')));

revoke all on public.contaazul_vinculos from anon;
grant select, insert, update, delete on public.contaazul_vinculos to authenticated;
grant select, insert, update, delete on public.contaazul_vinculos to service_role;
