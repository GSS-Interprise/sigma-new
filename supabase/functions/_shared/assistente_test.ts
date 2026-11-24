import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  campanhaDaPagina, cartaoEdicao, contextoTela, esquemaGemini, historico, instrucoes, nomeDaTela, roboLiberado, textoValor, veContratos,
} from "./assistente.ts";
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
  assertStringIncludes(t, "tela Prospecção (campanhas)");
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

Deno.test("contratos: quem só tem papel de licitação não recebe o domínio (igual à tela)", () => {
  assertEquals(veContratos(["licitador"]), false);
  assertEquals(veContratos(["lider_licitacao", "gestor_contratos"]), false);
  assertEquals(veContratos(["admin", "licitador"]), true);
  assertEquals(veContratos(["gestor_contratos"]), true);
  assertEquals(veContratos(["diretoria"]), true);
});

const ID = "0b6e1c3a-9f2d-4c1e-8a7b-1234567890ab";

Deno.test("campanha da página: ?campanha= da Prospecção e a rota de propostas; lixo é ignorado", () => {
  assertEquals(campanhaDaPagina(`/prospeccao?campanha=${ID}`), ID);
  assertEquals(campanhaDaPagina(`/prospeccao?view=dashboard&campanha=${ID.toUpperCase()}`), ID);
  assertEquals(campanhaDaPagina(`/disparos/campanhas/${ID}/propostas`), ID);
  assertEquals(campanhaDaPagina("/prospeccao"), null);
  assertEquals(campanhaDaPagina("/prospeccao?campanha=1' or 1=1"), null);
  assertEquals(campanhaDaPagina(null), null);
});

Deno.test("nome da tela: rotas principais com nome amigável; rota desconhecida sai como está", () => {
  assertEquals(nomeDaTela(`/prospeccao?campanha=${ID}`), "Prospecção (campanhas)");
  assertEquals(nomeDaTela("/prospeccao/nova"), "Nova campanha (assistente de criação)");
  assertEquals(nomeDaTela("/licitacoes/triagem"), "Licitações");
  assertEquals(nomeDaTela("/radiologia"), "Radiologia");
  assertEquals(nomeDaTela("/"), "Início");
  assertEquals(nomeDaTela("/qualquer"), "/qualquer");
});

Deno.test("contexto da tela: dentro da campanha a pergunta é sobre ela; fora, todas", () => {
  const dentro = contextoTela(`/prospeccao?campanha=${ID}`, " GO Braço do Norte ").join(" ");
  assertStringIncludes(dentro, "tela Prospecção (campanhas)");
  assertStringIncludes(dentro, 'dentro da campanha "GO Braço do Norte"');
  assertStringIncludes(dentro, "citar outra campanha pelo nome, responda sobre a citada");
  const fora = contextoTela("/prospeccao", null).join(" ");
  assertStringIncludes(fora, "não está dentro de uma campanha");
  assert(!fora.includes('dentro da campanha "'));
  const t = instrucoes(acessosDoUsuario(DOMINIOS, new Set(["campanhas"])), { agora, podeCriar: false, podeEditar: false, pagina: "/prospeccao", campanha: "Pediatria RS" });
  assertStringIncludes(t, 'dentro da campanha "Pediatria RS"');
});

// Cliente falso só com o encadeamento que roboLiberado usa.
const falso = (r: { data: unknown; error: unknown }, vistos: string[] = []) => ({
  from: (t: string) => ({ select: (_c: string) => ({ eq: (_c2: string, v: string) => { vistos.push(`${t}:${v}`); return { maybeSingle: () => Promise.resolve(r) }; } }) }),
});

Deno.test("permissão do robô: só quem está na lista; sem login ou erro de consulta = recusa", async () => {
  const vistos: string[] = [];
  assertEquals(await roboLiberado(falso({ data: { user_id: "u1" }, error: null }, vistos), "u1"), true);
  assertEquals(vistos, ["assistente_liberados:u1"]);
  assertEquals(await roboLiberado(falso({ data: null, error: null }), "u2"), false);
  assertEquals(await roboLiberado(falso({ data: { user_id: "u3" }, error: { message: "falhou" } }), "u3"), false);
  assertEquals(await roboLiberado(falso({ data: { user_id: "x" }, error: null }), null), false);
});
