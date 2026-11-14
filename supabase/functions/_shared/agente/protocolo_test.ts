// deno test --node-modules-dir=none agente/  (a partir de supabase/functions/_shared)
import { assert, assertEquals, assertMatch, assertNotEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonico, constituicao, guiaTexto, hashResultado, PROTOCOLO_VERSAO, renderizar, rodape } from "./protocolo.ts";
import { acessosDoUsuario, DOMINIOS, dominioBloqueado, exposto, validarRegistro } from "./registro.ts";
import type { Ctx, Dominio } from "./tipos.ts";
import { escalas } from "./dominios/escalas.ts";
import { acharCampanhas, campanhas, linhaFunil } from "./dominios/campanhas.ts";
import { agruparMotivos, motivoLegivel } from "./motivos.ts";
import { motivoLegivel as motivoTela } from "../../../../src/lib/textoDono.ts";
import { hojeBR, lerData } from "./tempo.ts";

const fonte = { nome: "Dr. Escala", atualizado_em: "2026-11-14T09:06:00Z" };

Deno.test("renderizar: resumo, corpo, corte e rodapé em ordem fixa", () => {
  const t = renderizar({ resumo: "**2 plantões**", corpo: "\n- a\n- b", dados: [], cortado: { mostrados: 400, dica: "peça um período menor." }, fonte });
  assertEquals(t, `**2 plantões**\n- a\n- b\n\n(Lista cortada em 400: peça um período menor.)\n\n_Fonte: Dr. Escala, dado de 14/11/2026, 06:06 · protocolo v${PROTOCOLO_VERSAO}_`);
});

Deno.test("rodapé: hora em Brasília e fonte nunca sincronizada", () => {
  assertMatch(rodape(fonte), /dado de 14\/11\/2026, 06:06/);
  assertMatch(rodape({ nome: "X", atualizado_em: null }), /fonte ainda não sincronizada/);
});

Deno.test("canonico: ordem das chaves não muda a string; undefined some", () => {
  assertEquals(canonico({ b: 1, a: [1, { d: 2, c: null }] }), canonico({ a: [1, { c: null, d: 2 }], b: 1 }));
  assertEquals(canonico({ a: 1, x: undefined }), '{"a":1}');
});

Deno.test("hash: mesmo fato = mesmo hash; fato ou ferramenta diferente = outro hash", async () => {
  const h1 = await hashResultado("plantoes_descobertos", { ini: "2026-11-16", n: [1, 2] });
  assertEquals(h1, await hashResultado("plantoes_descobertos", { n: [1, 2], ini: "2026-11-16" }));
  assertNotEquals(h1, await hashResultado("plantoes_descobertos", { ini: "2026-11-16", n: [1, 3] }));
  assertNotEquals(h1, await hashResultado("quem_esta_escalado", { ini: "2026-11-16", n: [1, 2] }));
  assertMatch(h1, /^[0-9a-f]{64}$/);
});

Deno.test("constituição: curta, lista disponíveis, sem acesso e em breve", () => {
  const ac = acessosDoUsuario(DOMINIOS, "todos");
  const c = constituicao(ac);
  assert(c.length < 2500, `constituição com ${c.length} caracteres`);
  assertMatch(c, /- escalas: /);
  assertMatch(c, /- campanhas: /);
  assertMatch(c, /Ainda não disponíveis: contratos/);
  assert(!c.includes("Sem acesso"));
  const sem = constituicao(acessosDoUsuario(DOMINIOS, new Set()));
  assertMatch(sem, /Sem acesso para o seu usuário .*: escalas/);
  assertMatch(sem, /- nenhum/);
});

Deno.test("guia: traz glossário, rotas e limites; em breve avisa", () => {
  const g = guiaTexto(escalas);
  for (const s of ["## Glossário", "Plantão descoberto (furo)", "`plantoes_descobertos`", "## O que este domínio ainda não responde", "## Perguntas-padrão"]) assert(g.includes(s), s);
  const eb = guiaTexto(DOMINIOS.find((d) => d.id === "contratos")!);
  assertMatch(eb, /Ainda não disponível/);
});

Deno.test("registro atual é válido e cada rota do guia aponta para ferramenta do domínio", () => {
  validarRegistro(DOMINIOS);
  for (const d of DOMINIOS) {
    const nomes = new Set(d.ferramentas.map((f) => f.nome));
    for (const r of d.guia.rotas) assert(nomes.has(r.ferramenta), `${d.id}: rota para ${r.ferramenta} inexistente`);
  }
});

const ferr = (nome: string) => ({ nome, titulo: "t", descricao: "d", inputSchema: {}, executar: async () => ({ resumo: "", dados: null, fonte }) });
const dom = (id: string, nomes: string[], extra: Partial<Dominio> = {}): Dominio => ({
  id, titulo: id, versao: "1.0.0", status: "ativo", resumo: id, ferramentas: nomes.map(ferr), prompts: [],
  guia: { proposito: "", glossario: [], rotas: [], regras: [], limites: [] }, ...extra,
});

Deno.test("validarRegistro barra prefixo errado, repetido, reservado e em_breve com ferramenta", () => {
  assertThrows(() => validarRegistro([dom("contratos", ["vigentes"])]), Error, "prefixo");
  assertThrows(() => validarRegistro([dom("contratos", ["contratos_a"]), dom("contratos", [])]), Error, "domínio repetido");
  assertThrows(() => validarRegistro([dom("contratos", ["contratos_a", "contratos_a"])]), Error, "ferramenta repetida");
  assertThrows(() => validarRegistro([dom("sigma", ["sigma_x"])]), Error, "reservado");
  assertThrows(() => validarRegistro([dom("crm", ["crm_a"], { status: "em_breve" })]), Error, "em_breve");
});

Deno.test("exposto: transversais sempre; domínio bloqueado some e é reconhecido", () => {
  const todos = exposto(acessosDoUsuario(DOMINIOS, "todos"));
  const nomes = todos.ferramentas.map((f) => f.nome);
  assertEquals(nomes.slice(0, 2), ["sigma_dominios", "sigma_guia"]);
  assert(nomes.includes("plantoes_descobertos"));
  assertEquals(todos.dominioDe.get("quem_esta_escalado"), "escalas");
  assertEquals(todos.prompts.length, escalas.prompts.length + campanhas.prompts.length);

  const sem = acessosDoUsuario(DOMINIOS, new Set());
  const exp = exposto(sem);
  assertEquals(exp.ferramentas.map((f) => f.nome), ["sigma_dominios", "sigma_guia"]);
  assertEquals(exp.prompts.length, 0);
  assertEquals(dominioBloqueado(sem, "plantoes_descobertos")?.id, "escalas");
  assertEquals(dominioBloqueado(sem, "nao_existe"), null);
});

Deno.test("acessos: só o que a tabela libera; em_breve nunca, mesmo com a linha", () => {
  const ac = acessosDoUsuario(DOMINIOS, new Set(["escalas", "contratos", "inexistente"]));
  assertEquals(ac.filter((a) => a.liberado).map((a) => a.dominio.id), ["escalas"]);
  assertEquals(acessosDoUsuario(DOMINIOS, new Set(["contratos"])).filter((a) => a.liberado).length, 0);
});

const ctx: Ctx ={ svc: null, userId: "u", agora: new Date("2026-11-14T12:00:00Z") };

Deno.test("sigma_guia: devolve o guia, nega sem acesso e recusa assunto desconhecido", async () => {
  const guia = (ac: ReturnType<typeof acessosDoUsuario>) => exposto(ac).ferramentas.find((f) => f.nome === "sigma_guia")!;
  const r = await guia(acessosDoUsuario(DOMINIOS, "todos")).executar(ctx, { dominio: "Escalas" });
  assertMatch(r.resumo, /# Guia do domínio escalas/);
  const n = await guia(acessosDoUsuario(DOMINIOS, new Set())).executar(ctx, { dominio: "escalas" });
  assertMatch(n.resumo, /não tem acesso/);
  await guia(acessosDoUsuario(DOMINIOS, "todos")).executar(ctx, { dominio: "financeiro" }).then(
    () => { throw new Error("aceitou assunto desconhecido"); },
    (e) => assertMatch(e.message, /assunto desconhecido: financeiro/),
  );
});

Deno.test("prompts de escalas montam o roteiro com sigma_guia primeiro", () => {
  for (const p of escalas.prompts) assertMatch(p.texto({ hospital: "hro", data: "amanhã" }), /^Use o Sigma\. Chame sigma_guia com dominio=escalas/);
});

Deno.test("tempo: 'hoje' é o dia de Brasília, não o do UTC", () => {
  // 01:30 UTC de 15/11 ainda é 14/11 em Brasília.
  assertEquals(hojeBR(new Date("2026-11-15T01:30:00Z")), "2026-11-14");
  assertEquals(lerData("amanhã", undefined, "2026-11-14"), "2026-11-15");
});

Deno.test("campanhas: nome pelo jeito que o sócio fala; exato vence trecho; vários = perguntar", () => {
  const cs = [{ nome: "PEDIATRIA " }, { nome: "Pediatria UTI Chapecó" }, { nome: "Ginecologia e Obstetricia" }, { nome: "ANESTESIO - SMO " }];
  assertEquals(acharCampanhas(cs, "pediatria").map((c) => c.nome), ["PEDIATRIA "]);
  assertEquals(acharCampanhas(cs, "chapeco").length, 1);
  assertEquals(acharCampanhas(cs, "obstetrícia").length, 1);
  assertEquals(acharCampanhas(cs, "smo anestesio").length, 1);
  assertEquals(acharCampanhas(cs, "ped").length, 2);
  assertEquals(acharCampanhas(cs, "cardio").length, 0);
});

Deno.test("campanhas: linha do funil usa as palavras do glossário", () => {
  const l = linhaFunil({ universo_cfm: null, na_lista: 10, enviados: 8, entregues: 7, responderam: 3, interessados: 2, convertidos: 1, falharam: 1, sem_whatsapp: 0, aguardando_envio: 2, ultimo_envio: null });
  assertEquals(l, "na lista 10 · enviados 8 · responderam 3 · interessados 2 · convertidos 1");
  for (const t of ["Enviado", "Respondeu", "Interessado", "Convertido"]) assert(campanhas.guia.glossario.some((g) => g.termo === t), t);
  for (const p of campanhas.prompts) assertMatch(p.texto({ campanha: "x" }), /^Use o Sigma\. Chame sigma_guia com dominio=campanhas/);
});

Deno.test("motivos: a cópia da edge traduz igual à tela e a soma não muda", () => {
  for (const m of ["Business Account locked", "131049 healthy ecosystem engagement", "Message undeliverable", "re-engagement 24 hours", "User's number is part of an experiment", "sem detalhe"]) {
    assertEquals(motivoLegivel(m), motivoTela(m), m);
  }
  const g = agruparMotivos([{ motivo: "Message undeliverable", n: 5 }, { motivo: "Business Account locked", n: 5 }, { motivo: "x", n: 2 }]);
  assertEquals(g.map((x) => x.motivo), ["Conta da Meta bloqueada (pagamento)", "Número sem WhatsApp ou inválido", "Outros motivos"]);
  assertEquals(g.reduce((s, x) => s + x.n, 0), 12);
});
