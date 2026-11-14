import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { calcularIndicadores, destinoDoAviso, proximoPassoEscada, saidaConfiavel, textoIndicadores, type ExameDia } from "./slaEscada.ts";

const todos = { plantonista: true, coordenador: true, diretoria: true };
const agora = new Date("2026-11-14T03:00:00Z");
const ha = (min: number) => new Date(agora.getTime() - min * 60000).toISOString();

Deno.test("escada começa ligando ao plantonista", () => {
  assertEquals(proximoPassoEscada([], todos, agora), { acao: "ligar", passo: 1, papel: "plantonista" });
});

Deno.test("espera a ligação em curso terminar", () => {
  assertEquals(proximoPassoEscada([{ passo: 1, status: "enviado", criado_em: ha(1) }], todos, agora).acao, "esperar");
});

Deno.test("ligação que o Twilio não fechou em 5 min conta como terminada", () => {
  assertEquals(proximoPassoEscada([{ passo: 1, status: "enviado", criado_em: ha(6) }], todos, agora),
    { acao: "ligar", passo: 2, papel: "plantonista" });
});

Deno.test("dá 3 min entre uma ligação e a próxima", () => {
  assertEquals(proximoPassoEscada([{ passo: 1, status: "falhou", criado_em: ha(2) }], todos, agora).acao, "esperar");
  assertEquals(proximoPassoEscada([{ passo: 1, status: "falhou", criado_em: ha(4) }], todos, agora).acao, "ligar");
});

Deno.test("atender e desligar sem a tecla 1 segue a escada (2ª tentativa, depois coordenador)", () => {
  const l1 = { passo: 1, status: "entregue", criado_em: ha(10) };
  assertEquals(proximoPassoEscada([l1], todos, agora), { acao: "ligar", passo: 2, papel: "plantonista" });
  const l2 = { passo: 2, status: "falhou", criado_em: ha(4) };
  assertEquals(proximoPassoEscada([l1, l2], todos, agora), { acao: "ligar", passo: 3, papel: "coordenador" });
});

Deno.test("tecla 1 para a escada", () => {
  assertEquals(proximoPassoEscada([{ passo: 1, status: "respondido", criado_em: ha(4) }], todos, agora), { acao: "parar" });
});

Deno.test("papel sem ninguém escalado é pulado; escada acaba em fim", () => {
  const semCoord = { plantonista: true, coordenador: false, diretoria: true };
  const feitas = [{ passo: 1, status: "falhou", criado_em: ha(20) }, { passo: 2, status: "falhou", criado_em: ha(10) }];
  assertEquals(proximoPassoEscada(feitas, semCoord, agora), { acao: "ligar", passo: 4, papel: "diretoria" });
  const ate4 = [...feitas, { passo: 4, status: "falhou", criado_em: ha(5) }];
  assertEquals(proximoPassoEscada(ate4, semCoord, agora), { acao: "fim" });
  assertEquals(proximoPassoEscada([], { plantonista: false, coordenador: false, diretoria: false }, agora), { acao: "fim" });
});

Deno.test("dois plantonistas no mesmo passo: espera os dois terminarem", () => {
  const p1 = [{ passo: 1, status: "falhou", criado_em: ha(8) }, { passo: 1, status: "enviado", criado_em: ha(2) }];
  assertEquals(proximoPassoEscada(p1, todos, agora).acao, "esperar");
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
