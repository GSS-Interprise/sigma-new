import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { instrucoesClaude, lerPasso, MAX_CHAMADAS_POR_PASSO, pedidoClaude } from "./claude.ts";

Deno.test("passo: resposta final", () => {
  assertEquals(lerPasso({ resposta: "  São 12 plantões. " }), { tipo: "resposta", texto: "São 12 plantões." });
});

Deno.test("passo: ferramentas, com args ausentes viram {} e o excesso é cortado", () => {
  const p = lerPasso({ ferramentas: [{ nome: "escalas_furos" }, ...Array(9).fill({ nome: "x", args: { a: 1 } })] });
  assert(p && p.tipo === "ferramentas");
  assertEquals(p.chamadas.length, MAX_CHAMADAS_POR_PASSO);
  assertEquals(p.chamadas[0], { nome: "escalas_furos", args: {} });
});

Deno.test("passo: formato estranho = null (o Gemini assume)", () => {
  for (const x of [null, "texto", [1], {}, { resposta: "" }, { ferramentas: [{ args: {} }] }, { ferramentas: ["x"] }]) {
    assertEquals(lerPasso(x), null);
  }
});

Deno.test("instruções: mesmas regras do Gemini + ferramentas com nome exato; último passo sem ferramenta", () => {
  const f = [{ nome: "campanhas_resumo", descricao: "Resumo", esquema: { type: "object" } }];
  const com = instrucoesClaude("REGRAS DO SIGMA", f, true);
  assert(com.startsWith("REGRAS DO SIGMA"));
  assertStringIncludes(com, '"nome":"campanhas_resumo"');
  const sem = instrucoesClaude("REGRAS DO SIGMA", [], false);
  assertStringIncludes(sem, "responda agora");
  assert(!sem.includes("campanhas_resumo"));
});

Deno.test("pedido: conversa, pergunta e resultados das ferramentas, com resultado longo cortado", () => {
  const p = pedidoClaude([{ papel: "usuario", texto: "oi" }, { papel: "assistente", texto: "olá" }], "quantos furos?", [
    { chamadas: [{ nome: "escalas_furos", args: { dias: 7 } }], resultados: ["x".repeat(9000)] },
  ]);
  assertStringIncludes(p, "Pessoa: oi\nAssistente: olá");
  assertStringIncludes(p, "Pessoa: quantos furos?");
  assertStringIncludes(p, '### escalas_furos {"dias":7}');
  assertStringIncludes(p, "[resultado cortado]");
  assert(p.endsWith("Devolva agora o JSON do próximo passo."));
});

Deno.test("pedido: muitas ferramentas dividem o espaço e o pedido não passa de ~70 mil caracteres", () => {
  const rodadas = Array.from({ length: 6 }, () => ({
    chamadas: Array.from({ length: 4 }, () => ({ nome: "x", args: {} })), resultados: Array(4).fill("y".repeat(8000)),
  }));
  assert(pedidoClaude([], "pergunta", rodadas).length < 70_000);
});
