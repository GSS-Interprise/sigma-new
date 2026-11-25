import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { casarNumeros, conversas, filtrarNumeros, lerPeriodo, quando, remetente, textoMensagem } from "./conversas.ts";
import { ErroFerramenta } from "../tipos.ts";
import { validarRegistro } from "../registro.ts";

const insts = [
  { id: "i1", phone_number: "5547999990001" },
  { id: "i2", phone_number: "+55 47 99999-0002" },
  { id: "i3", phone_number: "5547999990003" },
  { id: "i4", phone_number: "5547999990004" },
];
const conexoes = [
  { id: "c1", phone_e164: "+5547999990001", display_name: "Escalas  GSS", uso: "escalas", responsavel_id: "p1" },
  { id: "c2", phone_e164: "+5547999990002", display_name: "Prospecção 2", uso: "prospeccao", responsavel_id: null },
  { id: "c3", phone_e164: "+5547999990003", display_name: "Celular do Fulano", uso: "pessoal", responsavel_id: "p1" },
  { id: "c4", phone_e164: "+5547999990004", display_name: "Ambulatório", uso: "ambulatorio", responsavel_id: null },
];
const nomes = new Map([["p1", "Danilo Souza"]]);

Deno.test("números: pessoal e sem cadastro ficam de fora, ambulatório entra; ordem por nome", () => {
  const ns = casarNumeros(insts, conexoes, nomes);
  assertEquals(ns.map((n) => n.instancia), ["i4", "i1", "i2"]);
  assertEquals(ns[1], { instancia: "i1", nome: "Escalas GSS", uso: "escalas", responsavel: "Danilo Souza", final: "0001" });
  assertEquals(ns[2].responsavel, null);
});

Deno.test("números: filtro por uso, nome, final e responsável; uso inválido é erro claro", () => {
  const ns = casarNumeros(insts, conexoes, nomes);
  assertEquals(filtrarNumeros(ns, { uso: "escalas" }).map((n) => n.instancia), ["i1"]);
  assertEquals(filtrarNumeros(ns, { uso: "Prospecção" }).map((n) => n.instancia), ["i2"]);
  assertEquals(filtrarNumeros(ns, { numero: "escalas" }).map((n) => n.instancia), ["i1"]);
  assertEquals(filtrarNumeros(ns, { numero: "0002" }).map((n) => n.instancia), ["i2"]);
  assertEquals(filtrarNumeros(ns, { pessoa: "danilo" }).map((n) => n.instancia), ["i1"]);
  assertEquals(filtrarNumeros(ns, {}).length, 3);
  assertThrows(() => filtrarNumeros(ns, { uso: "pessoal" }), ErroFerramenta);
  assertEquals(filtrarNumeros(ns, { uso: "ambulatório" }).map((n) => n.instancia), ["i4"]);
});

Deno.test("texto: áudio não é transcrito, mídia leva legenda, uma linha e corte em 600", () => {
  assertEquals(textoMensagem("audio", "[Mensagem de voz]"), "[áudio]");
  assertEquals(textoMensagem("image", "[Imagem]", "escala de dezembro"), "[Imagem] escala de dezembro");
  assertEquals(textoMensagem("image", "", null), "[imagem]");
  assertEquals(textoMensagem("document", "[Documento: nf.pdf]"), "[Documento: nf.pdf]");
  assertEquals(textoMensagem("text", "oi\n\n  tudo   bem?"), "oi tudo bem?");
  assertEquals(textoMensagem("text", ""), "[mensagem vazia]");
  const longo = textoMensagem("text", "a".repeat(700));
  assertEquals(longo.length, 600);
  assertEquals(longo.endsWith("…"), true);
});

Deno.test("hora: absoluta em Brasília (nada de 'há X min', que muda entre chamadas)", () => {
  assertEquals(quando("2026-11-24T02:30:00Z"), "23/11 23:30");
  assertEquals(quando("2026-11-24T15:05:00Z"), "24/11 12:05");
});

Deno.test("período: dias de Brasília; passado é fechado, até hoje é ao vivo; limite de 90 dias", () => {
  const agora = new Date("2026-11-24T02:00:00Z"); // 23/11 23:00 em Brasília
  const h = lerPeriodo({}, agora, 1);
  assertEquals([h.de, h.ate, h.aoVivo, h.rotulo], ["2026-11-23", "2026-11-23", true, "hoje"]);
  assertEquals(h.deIso, "2026-11-23T03:00:00.000Z");
  assertEquals(h.ateIso, agora.toISOString());
  const o = lerPeriodo({ de: "ontem", ate: "ontem" }, agora, 1);
  assertEquals([o.de, o.ate, o.aoVivo, o.deIso, o.ateIso, o.rotulo], ["2026-11-22", "2026-11-22", false, "2026-11-22T03:00:00.000Z", "2026-11-23T03:00:00.000Z", "em 22/11"]);
  const t = lerPeriodo({}, agora, 30);
  assertEquals([t.de, t.ate, t.rotulo], ["2026-10-25", "2026-11-23", "de 25/10 a hoje"]);
  assertThrows(() => lerPeriodo({ de: "2026-01-01" }, agora, 1), ErroFerramenta);
  assertThrows(() => lerPeriodo({ de: "2026-11-23", ate: "2026-11-20" }, agora, 1), ErroFerramenta);
  assertThrows(() => lerPeriodo({ de: "31/02" }, agora, 1), ErroFerramenta);
});

Deno.test("remetente: contato, pessoa da equipe, campanha ou GSS sem autor", () => {
  const p = new Map([["u1", "Ana"]]);
  assertEquals(remetente({ from_me: false, sent_by_user_id: null, campanha_lead_id: null }, "Dr. X", p), "Dr. X");
  assertEquals(remetente({ from_me: true, sent_by_user_id: "u1", campanha_lead_id: null }, "Dr. X", p), "GSS · Ana");
  assertEquals(remetente({ from_me: true, sent_by_user_id: null, campanha_lead_id: "c" }, "Dr. X", p), "GSS · campanha");
  assertEquals(remetente({ from_me: true, sent_by_user_id: null, campanha_lead_id: null }, "Dr. X", p), "GSS");
});

Deno.test("domínio conversas: prefixo, rotas para ferramentas que existem e só leitura", () => {
  validarRegistro([conversas]);
  const nomesF = new Set(conversas.ferramentas.map((f) => f.nome));
  for (const r of conversas.guia.rotas) assertEquals(nomesF.has(r.ferramenta), true, r.ferramenta);
  assertEquals([...nomesF].every((n) => n.startsWith("conversas_")), true);
});
