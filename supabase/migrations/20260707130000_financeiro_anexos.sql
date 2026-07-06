-- T03 Módulo Financeiro (07/07): anexos financeiros (NF e comprovante) em bucket
-- PRIVADO. Segue o padrão de contratos-documentos (privado + createSignedUrl), NÃO
-- o comunicacao-anexos (que virou público) — NF/comprovante são dados sensíveis.

create table if not exists public.financeiro_anexos (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references public.financeiro_pagamentos(id) on delete cascade,
  tipo text not null check (tipo in ('nf', 'comprovante')),
  arquivo_path text not null,     -- path no storage (NÃO url); preview via createSignedUrl
  arquivo_nome text,
  mime text,
  status text not null default 'recebido',   -- recebido | enviado
  enviado_para text,                          -- medico | contabilidade | ambos
  enviado_em timestamptz,
  criado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_fin_anexos_pagamento on public.financeiro_anexos (pagamento_id, tipo);

alter table public.financeiro_anexos enable row level security;

drop policy if exists "Financeiro roles read anexos" on public.financeiro_anexos;
create policy "Financeiro roles read anexos" on public.financeiro_anexos
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

drop policy if exists "Financeiro roles manage anexos" on public.financeiro_anexos;
create policy "Financeiro roles manage anexos" on public.financeiro_anexos
  for all to authenticated
  using (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role))
  with check (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role));

grant select, insert, update, delete on public.financeiro_anexos to authenticated, service_role;

-- bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('financeiro-anexos', 'financeiro-anexos', false, 52428800,
  array['application/pdf','image/jpeg','image/jpg','image/png'])
on conflict (id) do nothing;

drop policy if exists "Financeiro upload anexos storage" on storage.objects;
create policy "Financeiro upload anexos storage" on storage.objects for insert to authenticated
  with check (bucket_id='financeiro-anexos' and (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role)));

drop policy if exists "Financeiro view anexos storage" on storage.objects;
create policy "Financeiro view anexos storage" on storage.objects for select to authenticated
  using (bucket_id='financeiro-anexos' and (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role)));

drop policy if exists "Financeiro update anexos storage" on storage.objects;
create policy "Financeiro update anexos storage" on storage.objects for update to authenticated
  using (bucket_id='financeiro-anexos' and (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role)));

drop policy if exists "Financeiro delete anexos storage" on storage.objects;
create policy "Financeiro delete anexos storage" on storage.objects for delete to authenticated
  using (bucket_id='financeiro-anexos' and (public.is_admin(auth.uid()) or public.has_role(auth.uid(),'gestor_financeiro'::app_role) or public.has_role(auth.uid(),'diretoria'::app_role)));
