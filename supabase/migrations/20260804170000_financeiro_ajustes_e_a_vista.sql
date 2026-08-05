-- E1+E2 (04/08) — Fechamento Dr. Escala pelo relatório COMPLETO + ajustes por categoria.
-- Decisões travadas com o Raul (ver docs/arquitetura/financeiro-fechamento-fases-multifonte.md):
--   D1 "A VISTA" no Dr. Escala = JÁ PAGO → sai do valor a repassar, mas continua visível.
--   D2 ajuste é por categoria FIXA, com a Mavi podendo cadastrar categoria nova.
--   D3 o fluxo do Dr. Escala passa a ser o relatório Completo (plantão a plantão).

-- ── 1. grão de plantão: tipo + já pago à vista ──────────────────────────────
alter table public.financeiro_pagamento_itens
  add column if not exists tipo          text,      -- cru do relatório: NORMAL | A VISTA | Diurno | Noturno
  add column if not exists pago_a_vista  boolean not null default false;

comment on column public.financeiro_pagamento_itens.tipo is
  'Coluna "Tipo" crua do Dr. Escala. Sobrecarregada: quando vem A VISTA o relatório NÃO informa o turno (Diurno/Noturno).';

-- ── 2. pagamento: decomposição do valor ─────────────────────────────────────
-- valor_total deixa de ser um número solto e passa a ser derivado:
--   valor_total = valor_produzido - valor_a_vista + valor_ajustes
alter table public.financeiro_pagamentos
  add column if not exists valor_produzido numeric not null default 0,  -- bruto de todos os plantões
  add column if not exists valor_a_vista   numeric not null default 0,  -- já quitado na fonte (D1)
  add column if not exists valor_ajustes   numeric not null default 0;  -- mantido por trigger

-- ── 3. categorias de ajuste (D2) ────────────────────────────────────────────
create table if not exists public.financeiro_ajuste_categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  -- sinal só orienta a UI (pré-seleciona + ou -); não impede o outro sinal
  sinal      text not null default 'ambos' check (sinal in ('mais','menos','ambos')),
  ativo      boolean not null default true,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.financeiro_ajuste_categorias (nome, sinal) values
  ('Gestão',              'mais'),
  ('Bônus',               'mais'),
  ('Hora extra',          'mais'),
  ('Reembolso',           'mais'),
  ('Desconto',            'menos'),
  ('Adiantamento',        'menos'),
  ('Correção de escala',  'ambos')
on conflict (nome) do nothing;

-- ── 4. ajustes lançados no pagamento ────────────────────────────────────────
create table if not exists public.financeiro_pagamento_ajustes (
  id            uuid primary key default gen_random_uuid(),
  pagamento_id  uuid not null references public.financeiro_pagamentos(id) on delete cascade,
  categoria_id  uuid not null references public.financeiro_ajuste_categorias(id),
  -- sinal vive no valor: +200 de gestão, -150 de adiantamento. Zero não faz sentido.
  valor         numeric not null check (valor <> 0),
  justificativa text not null check (length(btrim(justificativa)) > 0),
  criado_por    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_fin_ajuste_pag on public.financeiro_pagamento_ajustes (pagamento_id);

-- ── 5. trigger: ajuste mexeu → recalcula o pagamento ────────────────────────
create or replace function public.fin_recalc_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.financeiro_pagamentos p
     set valor_ajustes = coalesce((select sum(a.valor)
                                     from public.financeiro_pagamento_ajustes a
                                    where a.pagamento_id = p_id), 0),
         updated_at    = now()
   where p.id = p_id;
  -- valor_total é sempre reconstruído a partir das 3 parcelas
  update public.financeiro_pagamentos p
     set valor_total = p.valor_produzido - p.valor_a_vista + p.valor_ajustes
   where p.id = p_id;
end $$;

create or replace function public.fin_ajuste_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.fin_recalc_pagamento(coalesce(new.pagamento_id, old.pagamento_id));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_fin_ajuste_recalc on public.financeiro_pagamento_ajustes;
create trigger trg_fin_ajuste_recalc
  after insert or update or delete on public.financeiro_pagamento_ajustes
  for each row execute function public.fin_ajuste_after_change();

-- ── 6. qual parser o import usa ─────────────────────────────────────────────
-- 'generico' = mapa_colunas (tabela plana, ex. Marieta).
-- 'dr_escala_completo' = relatório hierárquico do Dr. Escala (hospital → médico → plantões).
alter table public.financeiro_import_config
  add column if not exists parser text not null default 'generico';

insert into public.financeiro_import_config (nome, fonte, formato, parser, aba, header_row, layout, mapa_colunas, ativo)
select 'Dr. Escala — Relatório Completo', 'dr_escala', 'xlsx', 'dr_escala_completo', null, 1, 'linha', '{}'::jsonb, true
where not exists (select 1 from public.financeiro_import_config where parser = 'dr_escala_completo');

-- ── 7. RLS + GRANT (tabela sem grant explícito derruba edge com 42501) ──────
alter table public.financeiro_ajuste_categorias  enable row level security;
alter table public.financeiro_pagamento_ajustes  enable row level security;

drop policy if exists "fin ajuste cat rw" on public.financeiro_ajuste_categorias;
create policy "fin ajuste cat rw" on public.financeiro_ajuste_categorias
  for all to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role))
  with check (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role));

drop policy if exists "fin ajuste rw" on public.financeiro_pagamento_ajustes;
create policy "fin ajuste rw" on public.financeiro_pagamento_ajustes
  for all to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role))
  with check (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'gestor_financeiro'::app_role));

grant select, insert, update, delete on public.financeiro_ajuste_categorias to authenticated, service_role;
grant select, insert, update, delete on public.financeiro_pagamento_ajustes to authenticated, service_role;
grant execute on function public.fin_recalc_pagamento(uuid) to authenticated, service_role;
