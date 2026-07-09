-- Bloco 1 (fechar módulo financeiro) — Contas a Receber:
-- (1) Mavi (gestor_financeiro) passa a poder CADASTRAR/EDITAR clientes (hoje só vê).
-- (2) NF que a GSS EMITE para o cliente — anexo por cliente/contrato/competência,
--     em bucket PRIVADO (reusa `financeiro-anexos`, cujas policies de storage já
--     liberam gestor_financeiro/diretoria).

-- (1) Policy permissiva adicional (combina por OR com as existentes; não dropa nada).
drop policy if exists "Financeiro pode gerenciar clientes" on public.clientes;
create policy "Financeiro pode gerenciar clientes" on public.clientes
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role));

-- (2) NF de saída por cliente. Tabela de metadados; arquivo no bucket privado financeiro-anexos.
create table if not exists public.nf_cliente_anexos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  contrato_id uuid references public.contratos(id) on delete set null,
  receber_id uuid references public.financeiro_receber(id) on delete set null,
  mes_referencia int,
  ano_referencia int,
  numero_nf text,
  valor numeric,
  arquivo_path text not null,
  arquivo_nome text,
  mime text,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_nf_cliente_anexos_cliente on public.nf_cliente_anexos (cliente_id, ano_referencia, mes_referencia);

alter table public.nf_cliente_anexos enable row level security;

drop policy if exists "Financeiro le NF cliente" on public.nf_cliente_anexos;
create policy "Financeiro le NF cliente" on public.nf_cliente_anexos
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

drop policy if exists "Financeiro gerencia NF cliente" on public.nf_cliente_anexos;
create policy "Financeiro gerencia NF cliente" on public.nf_cliente_anexos
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

grant select, insert, update, delete on public.nf_cliente_anexos to authenticated, service_role;
