#!/usr/bin/env node
// Roda supabase/tests/medicos_prestador_sem_crm.sql sem banco de verdade, num Postgres em WASM (PGlite).
// Monta só o que o teste usa, no formato de produção (medicos e financeiro_pagamentos como as migrations
// deixaram), e aplica as migrations REAIS do vínculo (20261027130000) e do prestador (20261118160000).
//
// O PGlite não é dependência do projeto. Instale sem salvar e rode:
//   npm install --no-save @electric-sql/pglite && node scripts/testes/prestador-sem-crm-pglite.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (rel) => readFileSync(path.join(raiz, rel), "utf8");

let PGlite, unaccent;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
  ({ unaccent } = await import("@electric-sql/pglite/contrib/unaccent"));
} catch {
  console.error("PGlite não instalado: npm install --no-save @electric-sql/pglite");
  process.exit(2);
}

const db = new PGlite({ extensions: { unaccent } });

// Esquema de produção do que o teste toca (colunas obrigatórias e constraints de medicos; ver as migrations
// 20251002172058 e 20251014193351, e financeiro_pagamentos de 20260330175007 + medico_id).
await db.exec(`
  create extension if not exists unaccent;
  create table public.medicos (
    id uuid primary key default gen_random_uuid(),
    nome_completo text not null,
    crm text not null unique,
    especialidade text[],
    email text not null,
    telefone text not null,
    created_at timestamptz default now(),
    constraint medicos_especialidade_not_empty check (especialidade is null or array_length(especialidade, 1) > 0)
  );
  create table public.financeiro_pagamentos (
    id uuid primary key default gen_random_uuid(),
    profissional_nome text not null,
    medico_id uuid references public.medicos(id),
    mes_referencia integer not null,
    ano_referencia integer not null,
    unidade text,
    valor_total numeric(12,2) not null default 0
  );
`);

await db.exec(ler("supabase/migrations/20261027130000_financeiro_vincular_medico_cadastrado.sql"));
await db.exec(ler("supabase/migrations/20261118160000_medicos_prestador_sem_crm.sql"));

try {
  await db.exec(ler("supabase/tests/medicos_prestador_sem_crm.sql"));
  console.error("FALHOU: o teste terminou sem o TESTE_OK");
  process.exit(1);
} catch (e) {
  if (String(e.message).includes("TESTE_OK")) {
    console.log("ok - medicos_prestador_sem_crm.sql (TESTE_OK)");
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
}
