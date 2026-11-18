#!/usr/bin/env node
// Roda supabase/tests/financeiro_ajuste_horas.sql sem banco de verdade, num Postgres em WASM (PGlite).
// Monta só o que o teste usa, no formato de produção (financeiro_pagamentos, categorias e ajustes como as migrations
// deixaram), aplica o gatilho REAL do recálculo (seção 5 de 20260804170000) e a migration REAL das horas
// (20261118140000_financeiro_ajuste_horas.sql), que redefine fin_recalc_pagamento.
//
// O PGlite não é dependência do projeto. Instale sem salvar e rode:
//   npm install --no-save @electric-sql/pglite && node scripts/testes/financeiro-ajuste-horas-pglite.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (rel) => readFileSync(path.join(raiz, rel), "utf8");

let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  console.error("PGlite não instalado: npm install --no-save @electric-sql/pglite");
  process.exit(2);
}

const db = new PGlite();

// Colunas de financeiro_pagamentos das migrations 20260330175007 (base), 20260706120000 (setor, fonte, arquivo_origem,
// valor_hora_est), 20260804170000 (valor_produzido/a_vista/ajustes) e 20260810120000 (horas_a_vista_minutos).
await db.exec(`
  create table public.financeiro_pagamentos (
    id uuid primary key default gen_random_uuid(),
    profissional_nome text not null,
    mes_referencia integer not null,
    ano_referencia integer not null,
    unidade text,
    setor text,
    total_plantoes integer not null default 0,
    total_horas_minutos integer not null default 0,
    valor_total numeric(12,2) not null default 0,
    status text not null default 'pendente',
    fonte text not null default 'import',
    arquivo_origem text,
    valor_hora_est numeric,
    valor_produzido numeric not null default 0,
    valor_a_vista numeric not null default 0,
    valor_ajustes numeric not null default 0,
    horas_a_vista_minutos integer not null default 0,
    updated_at timestamptz not null default now()
  );
  create table public.financeiro_ajuste_categorias (
    id uuid primary key default gen_random_uuid(),
    nome text not null unique,
    sinal text not null default 'ambos' check (sinal in ('mais','menos','ambos'))
  );
  insert into public.financeiro_ajuste_categorias (nome, sinal) values ('Gestão', 'mais'), ('Correção de escala', 'ambos');
  -- 20260804170000 + origem (20260805150000)
  create table public.financeiro_pagamento_ajustes (
    id uuid primary key default gen_random_uuid(),
    pagamento_id uuid not null references public.financeiro_pagamentos(id) on delete cascade,
    categoria_id uuid not null references public.financeiro_ajuste_categorias(id),
    valor numeric not null check (valor <> 0),
    justificativa text not null check (length(btrim(justificativa)) > 0),
    criado_por uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    origem text not null default 'manual'
  );
`);

// gatilho do recálculo, como está na migration (a função fin_recalc_pagamento é trocada logo abaixo)
const m0804 = ler("supabase/migrations/20260804170000_financeiro_ajustes_e_a_vista.sql");
const secao5 = m0804.slice(m0804.indexOf("-- ── 5."), m0804.indexOf("-- ── 6."));
if (!secao5.includes("trg_fin_ajuste_recalc")) { console.error("seção 5 da migration 20260804170000 não encontrada"); process.exit(1); }
await db.exec(secao5);

await db.exec(ler("supabase/migrations/20261118140000_financeiro_ajuste_horas.sql"));

try {
  await db.exec(ler("supabase/tests/financeiro_ajuste_horas.sql"));
  console.error("FALHOU: o teste terminou sem o TESTE_OK");
  process.exit(1);
} catch (e) {
  if (String(e.message).includes("TESTE_OK")) {
    console.log("ok - financeiro_ajuste_horas.sql (TESTE_OK)");
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
}
