#!/usr/bin/env node
// Verificação da numeração automática do contrato (codigo_interno), caso CT 05/2026 da Bia (11/11/2026).
//
//   node scripts/verificar-numeracao-contrato.mjs
//
// Parte 1 (sempre): o schema do formulário (src/components/contratos/contratoFormSchema.ts) aceita contrato
//   novo sem ID, pré-contrato sem ID aberto pela lista e preserva o ID de contrato existente; e o campo
//   "ID (gerado automaticamente)" continua desabilitado na tela.
// Parte 2 (sempre): Postgres em memória (PGlite), migration real do trigger (20261014230000) aplicada sobre
//   uma tabela contratos mínima, e a numeração conferida. Não toca no Supabase da GSS.
// Sai com 1 se alguma conferência falhar.
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raiz = resolve(import.meta.dirname, "..");
let falhas = 0;
const conferir = (ok, nome, detalhe = "") => {
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
};

// ---------- Parte 1: formulário ----------
console.log("Parte 1: formulário do contrato");
const tmpFront = mkdtempSync(join(tmpdir(), "contrato-form-"));
const saida = join(tmpFront, "schema.mjs");
await build({
  entryPoints: [join(raiz, "src/components/contratos/contratoFormSchema.ts")],
  bundle: true, format: "esm", platform: "node", outfile: saida, logLevel: "silent",
  alias: { "@": join(raiz, "src") },
});
const { formSchema, statusContratoNoFormulario } = await import(pathToFileURL(saida).href);
rmSync(tmpFront, { recursive: true, force: true });

// Dados válidos do cadastro (CNPJ com dígito certo), como a Bia preenche.
const base = {
  cnpj: "11.222.333/0001-81", nome_fantasia: "Prefeitura de Planalto Alegre", razao_social: "Município de Planalto Alegre",
  estado: "SC", endereco: "Rua Central, 1", email_contato: "contato@exemplo.gov.br", telefone_contato: "(49) 3300-0000",
  nome_unidade: "Sede", tipo_contratacao: "licitacao", codigo_contrato: "CT 05/2026", tipo_servico: ["Plantão Presencial"],
  data_inicio: new Date(2026, 10, 11), prazo_meses: 12, assinado: "Pendente", dias_aviso_vencimento: 60,
};
const erros = (r) => (r.success ? "" : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

let r = formSchema.safeParse({ ...base, status_contrato: "Ativo" });
conferir(r.success && r.data.codigo_interno === undefined, "contrato novo sem ID passa e não manda ID para o banco", erros(r));

// O que o formulário carrega de um pré-contrato aberto pela lista (codigo_interno null, status Pre-Contrato).
r = formSchema.safeParse({ ...base, codigo_interno: null, status_contrato: "Pre-Contrato" });
conferir(!r.success, "sem a regra do status, o pré-contrato continuaria barrado (reprodução do defeito)", erros(r) || "passou");

r = formSchema.safeParse({ ...base, codigo_interno: null, status_contrato: statusContratoNoFormulario("Pre-Contrato") });
conferir(r.success && r.data.status_contrato === "Ativo", "pré-contrato sem ID aberto pela lista passa e vai como Ativo", erros(r));

r = formSchema.safeParse({ ...base, codigo_interno: 42, status_contrato: statusContratoNoFormulario("Inativo") });
conferir(r.success && r.data.codigo_interno === 42 && r.data.status_contrato === "Inativo",
  "contrato existente mantém o ID e o status", erros(r));

const aba = readFileSync(join(raiz, "src/components/contratos/AbaCadastroContrato.tsx"), "utf8");
const campoId = aba.slice(aba.indexOf('name="codigo_interno"'), aba.indexOf('name="codigo_interno"') + 700);
conferir(/ID \(gerado automaticamente\)/.test(campoId) && /\bdisabled\b/.test(campoId) && !/onChange/.test(campoId),
  "campo ID continua somente leitura na tela");

const dialog = readFileSync(join(raiz, "src/components/contratos/ContratoDialogWithClient.tsx"), "utf8");
conferir(dialog.includes("status_contrato: statusContratoNoFormulario(contrato.status_contrato)"),
  "formulário carrega o status do contrato aberto pela regra acima");
conferir(/const contratoData = contrato\?\.id && values\.codigo_interno/.test(dialog),
  "insert continua sem codigo_interno e edição continua mandando o número que já existe");

// ---------- Parte 2: banco ----------
console.log("\nParte 2: trigger do banco (Postgres em memória)");
const db = new PGlite();
const um = async (q) => Object.values((await db.query(q)).rows[0] ?? {})[0] ?? null;
try {
  // Tabela mínima com as colunas que o trigger usa; contratos 1..105 com lacunas, como a GSS tem hoje.
  await db.exec(`create table contratos (id serial primary key, codigo_contrato text, status_contrato text, codigo_interno integer,
                   objeto_contrato text);
                 create table contratos_renumeracao (contrato_id integer primary key, codigo_antigo integer, codigo_novo integer);
                 insert into contratos (codigo_contrato, status_contrato, codigo_interno)
                   select 'C-' || n, 'Ativo', n from generate_series(1, 105) n where n not in (78, 92, 94);
                 insert into contratos_renumeracao select id, codigo_interno + 3, codigo_interno from contratos where codigo_interno > 100;`);
  const foto = async () => [
    await um(`select string_agg(id || ':' || codigo_interno || ':' || status_contrato || ':' || coalesce(objeto_contrato, ''), ',' order by id)
                from contratos where codigo_contrato like 'C-%'`),
    await um(`select string_agg(contrato_id || ':' || codigo_antigo || ':' || codigo_novo, ',' order by contrato_id) from contratos_renumeracao`),
  ].join("|");
  const antes = await foto();

  await db.exec(readFileSync(join(raiz, "supabase/migrations/20261014230000_contrato_numero_ao_virar_contrato.sql"), "utf8"));

  const novo = await um(`insert into contratos (codigo_contrato, status_contrato) values ('CT 05/2026', 'Ativo') returning codigo_interno`);
  conferir(novo === 106, "contrato novo sem ID recebe o próximo número (MAX+1)", `recebeu ${novo ?? "nulo"}`);

  const idPre = await um(`insert into contratos (codigo_contrato, status_contrato) values ('LC-7209706', 'Pre-Contrato') returning id`);
  const numPre = await um(`select codigo_interno from contratos where id = ${idPre}`);
  conferir(numPre === null, "pré-contrato não consome número", `ficou ${numPre ?? "nulo"}`);

  // Mesmo update que a tela faz ao salvar o pré-contrato: status Ativo, sem mandar codigo_interno.
  const virou = await um(`update contratos set codigo_contrato = 'CT 05/2026', status_contrato = 'Ativo' where id = ${idPre} returning codigo_interno`);
  conferir(virou === 107, "pré-contrato salvo como contrato recebe o próximo número", `recebeu ${virou ?? "nulo"}`);

  // Edição de contrato existente: a tela manda o mesmo codigo_interno; trocar status também não pode renumerar.
  const ed1 = await um(`update contratos set objeto_contrato = 'editado', codigo_interno = 50 where codigo_interno = 50 returning codigo_interno`);
  const ed2 = await um(`update contratos set status_contrato = 'Inativo' where codigo_interno = 51 returning codigo_interno`);
  conferir(ed1 === 50 && ed2 === 51, "editar contrato existente preserva o número", `${ed1}, ${ed2}`);

  let repetiu = true;
  try { await db.exec(`insert into contratos (codigo_contrato, status_contrato, codigo_interno) values ('X', 'Ativo', 107)`); }
  catch { repetiu = false; }
  conferir(!repetiu, "número não se repete (índice único)");

  // Desfaz as duas edições de teste e compara com a foto de antes da migration.
  await db.exec(`update contratos set status_contrato = 'Ativo' where codigo_interno = 51;
                 update contratos set objeto_contrato = null where codigo_interno = 50;`);
  conferir((await foto()) === antes, "contratos que já existiam e o de-para da renumeração ficaram iguais");
} catch (e) {
  conferir(false, "banco em memória", String(e.message || e).split("\n")[0]);
} finally {
  await db.close();
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
process.exit(falhas ? 1 : 0);
