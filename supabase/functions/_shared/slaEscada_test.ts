import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { calcularIndicadores, daModalidade, destinoDoAviso, modalidadeDoExame, noPeriodo, passosAgora, saidaConfiavel, textoIndicadores, type ExameDia } from "./slaEscada.ts";

const P = (id: string, destino: "plantonista" | "contato", minutos: number, ativo = true) =>
  ({ id, destino, minutos, canal: "whatsapp" as const, ativo });
const seq = [P("w1", "plantonista", -25), P("w2", "plantonista", 0), P("l1", "plantonista", 5), P("c1", "contato", 10), P("c2", "contato", 10)];
const ids = (x: { id: string }[]) => x.map((p) => p.id);

Deno.test("avisos: nada antes do 1º passo; 1º passo na hora dele", () => {
  assertEquals(ids(passosAgora(seq, new Set(), -30)), []);
  assertEquals(ids(passosAgora(seq, new Set(), -25)), ["w1"]);
});

Deno.test("avisos: passo que já foi não repete; o seguinte vai quando chega", () => {
  assertEquals(ids(passosAgora(seq, new Set(["w1"]), -10)), []);
  assertEquals(ids(passosAgora(seq, new Set(["w1"]), 1)), ["w2"]);
});

Deno.test("avisos: exame que aparece atrasado recebe só o passo mais adiantado do plantonista", () => {
  assertEquals(ids(passosAgora(seq, new Set(), 6)), ["l1"]);
  // e passo anterior a um que já foi não volta
  assertEquals(ids(passosAgora(seq, new Set(["l1"]), 7)), []);
});

Deno.test("avisos: contatos vão todos quando chegam, junto com o plantonista", () => {
  assertEquals(ids(passosAgora(seq, new Set(["w1", "w2", "l1"]), 10)), ["c1", "c2"]);
  assertEquals(ids(passosAgora(seq, new Set(["w1", "w2", "l1", "c1"]), 12)), ["c2"]);
});

Deno.test("avisos: passo desligado não vai e não bloqueia o seguinte", () => {
  const s2 = [P("w1", "plantonista", -25), P("w2", "plantonista", 0, false), P("l1", "plantonista", 5)];
  assertEquals(ids(passosAgora(s2, new Set(["w1"]), 2)), []);
  assertEquals(ids(passosAgora(s2, new Set(["w1"]), 5)), ["l1"]);
});

const ex = (o: Partial<ExameDia>): ExameDia => ({
  origem: "ps", inicio_em: "2026-11-14T01:00:00Z", vence_em: "2026-11-14T03:00:00Z", saiu_em: null, saida_confiavel: null,
  assumido_em: null, silenciado_em: null, ...o,
});

Deno.test("indicadores: % no prazo só com saída confiável, por origem", () => {
  const ind = calcularIndicadores([
    ex({ saiu_em: "2026-11-14T02:00:00Z", saida_confiavel: true }),                       // PS no prazo
    ex({ saiu_em: "2026-11-14T03:30:00Z", saida_confiavel: true, inicio_em: "2026-11-14T01:10:00Z" }), // PS fora
    ex({ saiu_em: "2026-11-14T02:00:00Z", saida_confiavel: false }),                      // não mede
    ex({ origem: "internado", saiu_em: "2026-11-14T02:30:00Z", saida_confiavel: true }),  // internado no prazo
  ], [], new Date("2026-11-14T10:00:00Z"));
  assertEquals(ind.total, 4);
  assertEquals(ind.noPrazoPct, 67);
  assertEquals(ind.porOrigem[0], { origem: "Pronto Socorro", total: 3, medidos: 2, noPrazo: 1, pct: 50 });
  assertEquals(ind.porOrigem[1], { origem: "Internado", total: 1, medidos: 1, noPrazo: 1, pct: 100 });
});

Deno.test("indicadores: vencido sem ninguém assumir e horas com mais atraso (hora de Brasília)", () => {
  const ind = calcularIndicadores([
    ex({ inicio_em: "2026-11-14T01:00:00Z" }),                                            // 22h BRT, ainda na fila e vencido
    ex({ inicio_em: "2026-11-14T01:20:00Z", assumido_em: "2026-11-14T03:10:00Z" }),       // 22h, vencido mas assumido
    ex({ inicio_em: "2026-11-14T05:00:00Z", vence_em: "2026-11-14T07:00:00Z", silenciado_em: "2026-11-14T06:00:00Z" }),
  ], [], new Date("2026-11-14T10:00:00Z"));
  assertEquals(ind.vencidosSemInteracao, 1);
  assertEquals(ind.horasComAtraso[0], { hora: "22h", vencidos: 2 });
});

Deno.test("indicadores: média do primeiro aviso até assumir", () => {
  const ind = calcularIndicadores([ex({})], [
    { exame_id: "a", criado_em: "2026-11-14T03:00:00Z", assumido_em: "2026-11-14T03:10:00Z" },
    { exame_id: "a", criado_em: "2026-11-14T03:05:00Z", assumido_em: "2026-11-14T03:10:00Z" },
    { exame_id: "b", criado_em: "2026-11-14T04:00:00Z", assumido_em: "2026-11-14T04:20:00Z" },
    { exame_id: "c", criado_em: "2026-11-14T05:00:00Z", assumido_em: null },
  ], new Date("2026-11-14T10:00:00Z"));
  assertEquals(ind.avisoAteAssumirMin, 15);
});

Deno.test("texto do e-mail: dia vazio e dia com exames", () => {
  assertEquals(textoIndicadores(calcularIndicadores([], []), "Hospital Marieta", "13/11 7h a 14/11 7h"),
    "Hospital Marieta, 13/11 7h a 14/11 7h: nenhum exame na fila do PACS.");
  const t = textoIndicadores(calcularIndicadores([ex({ saiu_em: "2026-11-14T02:00:00Z", saida_confiavel: true })], [],
    new Date("2026-11-14T10:00:00Z")), "Hospital Marieta", "ontem");
  assertEquals(t.split("\n")[0], "Hospital Marieta, ontem: 1 exame na fila.");
  assertEquals(t.split("\n")[1], "No prazo: 100% dos laudos com horário confiável.");
});

Deno.test("saída confiável: vista até 10 min depois da última leitura completa", () => {
  assertEquals(saidaConfiavel("2026-11-14T02:09:00Z", "2026-11-14T02:00:00Z"), true);
  assertEquals(saidaConfiavel("2026-11-14T02:11:00Z", "2026-11-14T02:00:00Z"), false);
  assertEquals(saidaConfiavel(null, "2026-11-14T02:00:00Z"), false);
  assertEquals(saidaConfiavel("2026-11-14T02:05:00Z", null), false);
});

Deno.test("teste interno: aviso vai para o número de teste e guarda para quem iria", () => {
  const dr = { nome: "Dr. Fulano", telefone: "5547999990000" };
  assertEquals(destinoDoAviso(dr, ""), { nome: "Dr. Fulano", telefone: "5547999990000", teste: false });
  assertEquals(destinoDoAviso(dr, "55 54 98435-1512"), { nome: "Dr. Fulano (teste interno)", telefone: "5554984351512", teste: true });
  assertEquals(destinoDoAviso(dr, "123"), { nome: "Dr. Fulano", telefone: "5547999990000", teste: false });
});

Deno.test("modalidade do exame: ultrassom pelo nome, o resto é TC", () => {
  assertEquals(modalidadeDoExame("TC Torax"), "TC");
  assertEquals(modalidadeDoExame("US Abdome total"), "US");
  assertEquals(modalidadeDoExame("Doppler venoso"), "US");
  assertEquals(modalidadeDoExame(null), "TC");
  assertEquals(modalidadeDoExame("TORAX SC(AduIt)"), "TC");
});

Deno.test("plantonista da modalidade; sem ninguém dela, todos", () => {
  const p = [{ nome: "a", modalidade: "TC" }, { nome: "b", modalidade: "US" }, { nome: "c", modalidade: null }];
  assertEquals(daModalidade(p, "US").map((x) => x.nome), ["b", "c"]);
  assertEquals(daModalidade([{ nome: "a", modalidade: "TC" }], "US").map((x) => x.nome), ["a"]);
});

Deno.test("período do contato: comercial seg-sex 7h-17h, fora = noite e fim de semana (Wagner, 26/11)", () => {
  // 26/11/2026 é quinta. Horas em Brasília (UTC-3).
  const qui10 = new Date("2026-11-26T13:00:00Z"), qui20 = new Date("2026-11-26T23:00:00Z");
  const sab10 = new Date("2026-11-28T13:00:00Z"), qui0659 = new Date("2026-11-26T09:59:00Z");
  assertEquals([noPeriodo("comercial", qui10), noPeriodo("fora", qui10), noPeriodo("sempre", qui10)], [true, false, true]);
  assertEquals([noPeriodo("comercial", qui20), noPeriodo("fora", qui20)], [false, true]);
  assertEquals([noPeriodo("comercial", sab10), noPeriodo("fora", sab10)], [false, true]);
  assertEquals([noPeriodo("comercial", qui0659), noPeriodo("fora", qui0659)], [false, true]);
  assertEquals(noPeriodo(null, qui20), true);
  const qui1730 = new Date("2026-11-26T20:30:00Z"), qui1659 = new Date("2026-11-26T19:59:00Z");
  assertEquals([noPeriodo("comercial", qui1659), noPeriodo("comercial", qui1730), noPeriodo("fora", qui1730)], [true, false, true]);
});

Deno.test("período: contato fora do período não sai (e fica para quando entrar, se ainda couber)", () => {
  const ps = [{ ...P("brenda", "contato", 10), periodo: "comercial" }, { ...P("wagner", "contato", 10), periodo: "fora" }];
  assertEquals(ids(passosAgora(ps, new Set(), 12, new Date("2026-11-26T13:00:00Z"))), ["brenda"]);
  assertEquals(ids(passosAgora(ps, new Set(), 12, new Date("2026-11-26T23:00:00Z"))), ["wagner"]);
});
