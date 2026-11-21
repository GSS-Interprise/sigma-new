import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type DestinoFuro, type Furo, montarAvisos, nomeCurto, textoAviso } from "./furos.ts";

const agora = new Date("2026-11-21T21:20:00Z"); // 18h20 em Brasília
const h = (horas: number) => new Date(agora.getTime() + horas * 3_600_000).toISOString();
const furo = (id: number, emHoras: number, local_id = 1, hospital = "CEPON"): Furo =>
  ({ id, local_id, hospital, setor: "Radiologia", inicio: h(emHoras), fim: h(emHoras + 12) });
const todos: DestinoFuro = { nome: "Ana", fone: "5547999990000", local_ids: null };
const soCepon: DestinoFuro = { nome: "Bia", fone: "5547999991111", local_ids: [1] };

Deno.test("furo novo dentro de 7 dias vira aviso 'novo'; fora do horizonte e já começado, não", () => {
  const r = montarAvisos([furo(1, 48), furo(2, 24 * 8), furo(3, -1)], [todos], [], agora);
  assertEquals(r.length, 1);
  assertEquals(r[0].itens.map((i) => [i.furo.id, i.tipo]), [[1, "novo"]]);
});

Deno.test("furo a menos de 24 h vira só 'vespera', mesmo sem aviso 'novo' antes", () => {
  const r = montarAvisos([furo(1, 5)], [todos], [], agora);
  assertEquals(r[0].itens.map((i) => i.tipo), ["vespera"]);
});

Deno.test("não repete: 'novo' já avisado some; quando chega a 24 h, sai o 'vespera' uma vez", () => {
  const feitos = [{ plantao_id: 1, tipo: "novo" as const, fone: todos.fone }];
  assertEquals(montarAvisos([furo(1, 48)], [todos], feitos, agora), []);
  const perto = montarAvisos([furo(1, 10)], [todos], feitos, agora);
  assertEquals(perto[0].itens.map((i) => i.tipo), ["vespera"]);
  const depois = [...feitos, { plantao_id: 1, tipo: "vespera" as const, fone: todos.fone }];
  assertEquals(montarAvisos([furo(1, 10)], [todos], depois, agora), []);
});

Deno.test("destinatário com hospitais escolhidos só recebe os furos deles", () => {
  const r = montarAvisos([furo(1, 48, 1), furo(2, 48, 2, "Marieta")], [todos, soCepon], [], agora);
  assertEquals(r.find((a) => a.destino.nome === "Ana")!.itens.length, 2);
  assertEquals(r.find((a) => a.destino.nome === "Bia")!.itens.map((i) => i.furo.id), [1]);
});

Deno.test("o que já foi avisado a uma pessoa não conta para a outra", () => {
  const feitos = [{ plantao_id: 1, tipo: "novo" as const, fone: todos.fone }];
  const r = montarAvisos([furo(1, 48)], [todos, soCepon], feitos, agora);
  assertEquals(r.map((a) => a.destino.nome), ["Bia"]);
});

Deno.test("texto: resumo, hora de Brasília, sem quebra de linha e cortado com '+N no Sigma'", () => {
  const [resumo, lista] = textoAviso({ destino: todos, itens: [{ furo: furo(1, 5), tipo: "vespera" }, { furo: furo(2, 48), tipo: "novo" }] });
  assertEquals(resumo, "1 furo nas proximas 24 h e 1 furo novo nos proximos 7 dias");
  assertEquals(lista, "CEPON Radiologia 21/11 23h20-11h20; CEPON Radiologia 23/11 18h20-06h20");
  const muitos = Array.from({ length: 40 }, (_, i) => ({ furo: furo(i + 1, 30 + i), tipo: "novo" as const }));
  const [, cortada] = textoAviso({ destino: todos, itens: muitos }, 200);
  assertEquals(cortada.length <= 220, true);
  assertEquals(/\+\d+ no Sigma$/.test(cortada), true);
  assertEquals(/\n/.test(cortada), false);
});

Deno.test("nome do hospital em caixa alta fica curto e legível", () => {
  assertEquals(nomeCurto("HOSPITAL E MATERNIDADE MARIETA KONDER BORNHAUSEN"), "Marieta Konder Bornhausen");
  assertEquals(nomeCurto("CEPON"), "CEPON");
  assertEquals(nomeCurto(null), "Hospital sem nome");
});
