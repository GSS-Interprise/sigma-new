// deno test --node-modules-dir=none atendimento_test.ts  (a partir de supabase/functions/_shared)
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Config, dentroDoHorario, type Espera, minutosUteis, montarAvisos, textoAviso } from "./atendimento.ts";

const cfg: Config = {
  faixas: [{ min: 3, para: "responsavel" }, { min: 10, para: "responsavel" }, { min: 60, para: "coordenacao" }, { min: 180, para: "diretoria" }],
  dias: [1, 2, 3, 4, 5], hora_inicio: "08:00", hora_fim: "18:00",
  coordenacao: [{ nome: "Ramone", fone: "5547999990001" }], diretoria: [{ nome: "Maikon", fone: "5547999990002" }],
  modo_teste: false, teste_fone: "5554999990000",
};
// Terça, 24/11/2026 (sábado = 21, segunda = 23). 10h de Brasília = 13h UTC.
const br = (dia: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, dia, h + 3, m));
const esp = (id: string, desde: Date, extra: Partial<Espera> = {}): Espera => ({
  conversation_id: id, contato_nome: `Contato ${id}`, contato_marcado: null, prioridade: false, numero: "+5547936183761",
  responsavel_id: "u1", responsavel_nome: "Ester Souza", esperando_desde: desde.toISOString(), ia_atuando: false, ...extra,
});
const fones = new Map([["u1", "5547999990003"]]);

Deno.test("minutos úteis: só dentro do horário; fim de semana não conta", () => {
  assertEquals(minutosUteis(br(24, 9), br(24, 9, 12), cfg), 12);
  assertEquals(minutosUteis(br(24, 7), br(24, 8, 5), cfg), 5);
  assertEquals(minutosUteis(br(21, 15), br(23, 8, 4), cfg), 4); // sábado 15h -> segunda 8h04
  assertEquals(minutosUteis(br(24, 17, 50), br(25, 8, 10), cfg), 20); // vira a noite
  assertEquals(dentroDoHorario(br(24, 18, 30), cfg), false);
  assertEquals(dentroDoHorario(br(24, 9), cfg), true);
});

Deno.test("escada: 3 e 10 min ao responsável, 60 à coordenação, 180 também à diretoria", () => {
  const agora = br(24, 13);
  const avisos = montarAvisos([esp("a", br(24, 12, 55)), esp("b", br(24, 12, 45)), esp("c", br(24, 11, 50)), esp("d", br(24, 9, 50))], cfg, [], fones, agora);
  const por = Object.fromEntries(avisos.map((a) => [a.nome, a.itens.map((i) => `${i.espera.conversation_id}:${i.faixa}`)]));
  assertEquals(por["Ester Souza"], ["d:10", "c:10", "b:10", "a:3"]);
  assertEquals(por["Ramone"], ["d:180", "c:60"]);
  assertEquals(por["Maikon"], ["d:180"]);
});

Deno.test("não repete o que já saiu; IA atuando e fora do horário não avisam", () => {
  const agora = br(24, 13);
  const e = esp("a", br(24, 12, 50));
  const feitos = [{ conversation_id: "a", esperando_desde: e.esperando_desde, faixa_min: 10, fone: "5547999990003" },
    { conversation_id: "a", esperando_desde: e.esperando_desde, faixa_min: 3, fone: "5547999990003" }];
  assertEquals(montarAvisos([e], cfg, feitos, fones, agora), []);
  assertEquals(montarAvisos([esp("x", br(24, 12), { ia_atuando: true })], cfg, [], fones, agora), []);
  assertEquals(montarAvisos([esp("y", br(24, 17))], cfg, [], fones, br(24, 19)), []);
});

Deno.test("sem responsável (ou sem telefone) vai para a coordenação; espera antiga não avisa", () => {
  const agora = br(24, 13);
  const a = montarAvisos([esp("s", br(24, 12, 50), { responsavel_id: null, responsavel_nome: null })], cfg, [], fones, agora);
  assertEquals(a.map((x) => x.nome), ["Ramone"]);
  assertEquals(montarAvisos([esp("v", br(18, 10))], cfg, [], fones, agora), []);
});

Deno.test("modo teste: tudo para o telefone de teste, um aviso por destino real", () => {
  const agora = br(24, 13);
  const a = montarAvisos([esp("d", br(24, 9, 50))], { ...cfg, modo_teste: true }, [], fones, agora);
  assertEquals(a.map((x) => [x.fone, x.destino_real]), [["5554999990000", "Ester Souza"], ["5554999990000", "Ramone"], ["5554999990000", "Maikon"]]);
  const [resumo, lista] = textoAviso(a[0], true);
  assertEquals(resumo, "[teste, para Ester Souza] 1 conversa esperando há 3 h 10 min");
  assertEquals(lista, "Contato d, 3 h 10 min, número 3761 de Ester");
});

Deno.test("texto: cliente marcado aparece pelo nome; lista longa corta com +N no Sigma", () => {
  const itens = Array.from({ length: 30 }, (_, i) => ({ espera: esp(`c${i}`, br(24, 12), { contato_marcado: i === 0 ? "Hospital Regional - diretor" : null, contato_nome: "Fulano de Tal com nome comprido" }), faixa: 10, minutos: 60 - i }));
  const [resumo, lista] = textoAviso({ nome: "R", fone: "1", fone_real: "1", destino_real: "R", itens }, false);
  assertEquals(resumo, "30 conversas esperando, a mais antiga há 1 h");
  assertEquals(lista.startsWith("Hospital Regional - diretor (cliente), 1 h, número 3761 de Ester; "), true);
  assertEquals(/\+\d+ no Sigma$/.test(lista), true);
  assertEquals(lista.length <= 700, true);
});
