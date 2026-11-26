#!/usr/bin/env node
// Roda supabase/tests/leads_chave_unica.sql sem banco de verdade, num Postgres em WASM (PGlite).
// Monta só o que o teste usa de public.leads, com os dois índices únicos de produção (idx_leads_chave_unica de
// 20260123191531 e idx_leads_cpf_unique de 20260223184151) e o gatilho, e aplica as migrations REAIS do gatilho
// (20261125210000 e 20261126120000, nessa ordem).
//
// O PGlite não é dependência do projeto. Instale sem salvar e rode:
//   npm install --no-save @electric-sql/pglite && node scripts/testes/leads-chave-unica-pglite.mjs
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

// Mesmo esquema que supabase/tests/leads_chave_unica_esquema.sql (usado quando o teste roda num Postgres local).
await db.exec(ler("supabase/tests/leads_chave_unica_esquema.sql"));
await db.exec(ler("supabase/migrations/20261125210000_leads_chave_unica_mensagem_clara.sql"));
await db.exec(ler("supabase/migrations/20261126120000_leads_cpf_preso_em_fundido.sql"));

try {
  await db.exec(ler("supabase/tests/leads_chave_unica.sql"));
  console.error("FALHOU: o teste terminou sem o TESTE_OK");
  process.exit(1);
} catch (e) {
  if (String(e.message).includes("TESTE_OK")) {
    console.log("ok - leads_chave_unica.sql (TESTE_OK)");
    process.exit(0);
  }
  console.error(e.message);
  process.exit(1);
}
