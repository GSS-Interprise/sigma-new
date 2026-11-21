import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cartaoEdicao, esquemaGemini, historico, instrucoes, textoValor } from "./assistente.ts";
import { acessosDoUsuario, DOMINIOS } from "./agente/registro.ts";

const agora = new Date("2026-11-21T21:00:00Z");

Deno.test("esquema: tira o que o Gemini não aceita e mantém tipos, enum e obrigatórios", () => {
  const s = esquemaGemini({ $schema: "x", type: "object", additionalProperties: false,
    properties: { a: { type: ["string", "null"], default: "x", description: "d" }, b: { type: "array", items: { type: "integer", minimum: 1 } },
      c: { type: "string", enum: ["x", 1] } }, required: ["a"] });
  assertEquals(s, { type: "object", properties: { a: { type: "string", description: "d" }, b: { type: "array", items: { type: "integer" } },
    c: { type: "string", enum: ["x", "1"] } }, required: ["a"] });
  assertEquals(esquemaGemini(undefined), { type: "object", properties: {} });
});

Deno.test("instruções: só o guia dos domínios liberados entra; o resto aparece como sem acesso", () => {
  const ac = acessosDoUsuario(DOMINIOS, new Set(["escalas"]));
  const t = instrucoes(ac, { agora, podeCriar: false, podeEditar: false });
  assertStringIncludes(t, "Guia do domínio escalas");
  assert(!t.includes("Guia do domínio campanhas"));
  assertStringIncludes(t, "Sem acesso para esta pessoa: Campanhas");
  assertStringIncludes(t, "não pode criar nem editar campanhas");
});

Deno.test("instruções: quem pode criar recebe as regras de proposta; sem nenhum domínio, diz que não tem acesso", () => {
  const t = instrucoes(acessosDoUsuario(DOMINIOS, new Set(["campanhas"])), { agora, podeCriar: true, podeEditar: false, pagina: "/prospeccao" });
  assertStringIncludes(t, "Você nunca grava nada");
  assertStringIncludes(t, "não pode editar campanha");
  assertStringIncludes(t, "/prospeccao");
  const vazio = instrucoes(acessosDoUsuario(DOMINIOS, new Set()), { agora, podeCriar: false, podeEditar: false });
  assertStringIncludes(vazio, "não tem acesso a nenhum assunto");
});

Deno.test("cartão de edição: título e antes/depois legíveis", () => {
  const c = cartaoEdicao(" GO Braço do Norte ", [
    { campo: "limite_por_numero", rotulo: "Envios por número por dia", antes: 50, depois: 80 },
    { campo: "status", rotulo: "Situação", antes: "ativa", depois: "pausada" },
    { campo: "sender_ids", rotulo: "Números", antes: ["+5547997132474"], depois: ["+5547997132474", "+554799292053"] },
  ]);
  assertEquals(c.titulo, "Mudar 3 itens da campanha GO Braço do Norte");
  assertEquals(c.linhas[1], { rotulo: "Situação", antes: "Ativa (disparando)", depois: "Pausada" });
  assertEquals(c.linhas[2].depois, "(47) 99713-2474, (47) 9929-2053");
});

Deno.test("texto de valor: vazio, booleano, destino de aviso", () => {
  assertEquals(textoValor(null), "—");
  assertEquals(textoValor(true), "Sim");
  assertEquals(textoValor([{ nome: "Ana", fone: "5547999990000" }]), "Ana (47) 99999-0000");
});

Deno.test("histórico: últimas N e sem mensagem vazia", () => {
  const m = Array.from({ length: 20 }, (_, i) => ({ papel: i % 2 ? "assistente" : "usuario", texto: i === 19 ? " " : `m${i}` }));
  const h = historico(m, 5);
  assertEquals(h.map((x) => x.texto), ["m14", "m15", "m16", "m17", "m18"]);
});
