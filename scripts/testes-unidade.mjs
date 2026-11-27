#!/usr/bin/env node
// Testes de unidade (npm test): acha *.test.ts em src e em supabase/functions/_shared, empacota cada um com o esbuild que já vem
// com o Vite (resolve o alias "@/" como no app) e roda com o executor de testes do próprio Node.
// Sem dependência nova: o projeto não tinha executor de testes para o front.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const src = path.join(raiz, "src");
const saida = path.join(raiz, "node_modules", ".cache", "testes-unidade");

// _shared das edge functions: só o que não depende de Deno usa *.test.ts (os testes Deno são *_test.ts)
const pastas = [src, path.join(raiz, "supabase", "functions", "_shared")];
const testes = pastas.flatMap((pasta) => readdirSync(pasta, { recursive: true })
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => path.join(pasta, f)));

if (!testes.length) {
  console.log("nenhum teste *.test.ts em src nem em supabase/functions/_shared");
  process.exit(0);
}

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

const saidas = [];
for (const arquivo of testes) {
  const destino = path.join(saida, path.relative(raiz, arquivo).replace(/\.tsx?$/, ".mjs"));
  await build({
    entryPoints: [arquivo],
    outfile: destino,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    alias: { "@": src },
    logLevel: "warning",
  });
  saidas.push(destino);
}

const r = spawnSync(process.execPath, ["--test", ...saidas], { stdio: "inherit" });
process.exit(r.status ?? 1);
