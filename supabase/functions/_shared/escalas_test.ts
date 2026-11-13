import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  acharHospitais, agrupar, diaBR, ehLocalTeste, filtroProfissional, hojeBR, lerData, lerMomento, linhaPlantao,
  type Local, periodoValido, type Plantao, resolverBusca, resumoPorHospital, somaDias,
} from "./escalas.ts";

const HOJE = "2026-11-13";

Deno.test("hoje em Brasília vira o dia certo mesmo depois das 21h (UTC já é amanhã)", () => {
  assertEquals(hojeBR(new Date("2026-11-14T01:30:00Z")), "2026-11-13");
  assertEquals(hojeBR(new Date("2026-11-14T03:00:00Z")), "2026-11-14");
});

Deno.test("somaDias atravessa mês e ano", () => {
  assertEquals(somaDias("2026-11-30", 1), "2026-12-01");
  assertEquals(somaDias("2026-12-31", 1), "2027-01-01");
  assertEquals(somaDias("2026-03-01", -1), "2026-02-28");
});

Deno.test("datas do jeito que o sócio escreve", () => {
  assertEquals(lerData("hoje", undefined, HOJE), "2026-11-13");
  assertEquals(lerData("Amanhã", undefined, HOJE), "2026-11-14");
  assertEquals(lerData("amanha", undefined, HOJE), "2026-11-14");
  assertEquals(lerData("amanh�", undefined, HOJE), "2026-11-14"); // acento quebrado no terminal
  assertEquals(lerData("ontem", undefined, HOJE), "2026-11-12");
  assertEquals(lerData("2026-12-05", undefined, HOJE), "2026-12-05");
  assertEquals(lerData("5/12", undefined, HOJE), "2026-12-05");
  assertEquals(lerData("05/12/27", undefined, HOJE), "2027-12-05");
  assertEquals(lerData("", "2026-01-01", HOJE), "2026-01-01");
});

Deno.test("data inválida não vira outro dia", () => {
  assertThrows(() => lerData("", undefined, HOJE), Error, "obrigatória");
  assertThrows(() => lerData("31/02/2026", undefined, HOJE), Error, "inválida");
  assertThrows(() => lerData("semana que vem", undefined, HOJE), Error, "inválida");
  assertThrows(() => lerData("2026-13-01", undefined, HOJE), Error, "inválida");
});

Deno.test("período: fim depois do início e dentro do máximo", () => {
  assert(periodoValido("2026-11-13", "2026-11-13", 31));
  assert(periodoValido("2026-11-13", "2026-12-14", 31));
  assert(!periodoValido("2026-11-13", "2026-12-15", 31));
  assert(!periodoValido("2026-11-13", "2026-11-12", 31));
});

Deno.test("momento sem fuso é hora de Brasília", () => {
  assertEquals(lerMomento("2026-11-13T19:00").toISOString(), "2026-11-13T22:00:00.000Z");
  assertEquals(lerMomento("2026-11-13T19:00:30").toISOString(), "2026-11-13T22:00:30.000Z");
  assertEquals(lerMomento("2026-11-13T19:00:00Z").toISOString(), "2026-11-13T19:00:00.000Z");
  const agora = new Date("2026-11-13T10:00:00Z");
  assertEquals(lerMomento("", agora), agora);
  assertThrows(() => lerMomento("depois do almoço"), Error, "inválido");
});

Deno.test("dia da semana em português", () => {
  assertEquals(diaBR("2026-11-13"), "sex 13/11/2026");
});

const LOCAIS: Local[] = [
  { id: 1, nome: "HOSPITAL REGIONAL DO OESTE", cidade: "Chapecó" },
  { id: 2, nome: "Maternidade Marieta Konder Bornhausen", cidade: "Itajaí" },
  { id: 3, nome: "CEPON", cidade: "Florianópolis" },
  { id: 4, nome: "Hospital de Gaspar", cidade: "Gaspar" },
  { id: 5, nome: "Hospital Regional de Joinville", cidade: "Joinville" },
];

Deno.test("hospital pelo nome exato, trecho, cidade e sem acento", () => {
  assertEquals(acharHospitais(LOCAIS, "cepon").map((l) => l.id), [3]);
  assertEquals(acharHospitais(LOCAIS, "marieta").map((l) => l.id), [2]);
  assertEquals(acharHospitais(LOCAIS, "chapeco").map((l) => l.id), [1]);
  assertEquals(acharHospitais(LOCAIS, "itajaí").map((l) => l.id), [2]);
  assertEquals(acharHospitais(LOCAIS, "regional").map((l) => l.id), [1, 5]);
});

Deno.test("hospital pelas palavras soltas e pela sigla", () => {
  assertEquals(acharHospitais(LOCAIS, "regional oeste").map((l) => l.id), [1]);
  assertEquals(acharHospitais(LOCAIS, "hro").map((l) => l.id), [1]); // partícula "do" fica fora da sigla
  assertEquals(acharHospitais(LOCAIS, "h").map((l) => l.id), [1, 2, 4, 5]); // "h" casa como trecho, não sigla
  assertEquals(acharHospitais(LOCAIS, "xyz"), []);
  assertEquals(acharHospitais(LOCAIS, "  "), []);
});

Deno.test("busca ambígua demais ou vazia vira aviso, sem consultar nada", () => {
  assertEquals(resolverBusca(LOCAIS, ""), { ids: null });
  assertEquals(resolverBusca(LOCAIS, "gaspar"), { ids: [4] });
  const nada = resolverBusca(LOCAIS, "xyz");
  assertEquals(nada.ids, []);
  assert(nada.aviso?.includes("escalas_hospitais"));
  const muitos = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, nome: `Hospital Santa ${i}`, cidade: null }));
  const amb = resolverBusca(muitos, "santa");
  assertEquals(amb.ids, []);
  assert(amb.aviso?.includes("7 hospitais"));
});

Deno.test("local de teste do Dr. Escala é reconhecido", () => {
  assert(ehLocalTeste("LOCAL TESTE GSS"));
  assert(!ehLocalTeste("Hospital Teste de Carga")); // só o padrão "local teste"
});

const P = (x: Partial<Plantao>): Plantao => ({
  id: 1, data: "2026-11-13", inicio: "2026-11-13T10:00:00Z", fim: "2026-11-13T22:00:00Z", local_id: 1,
  hospital: "CEPON", setor: "UTI", profissional_nome: "Ana Souza", profissional_crm: null, situacao: "Designado",
  tipo: "Normal", furo: false, ...x,
});

Deno.test("linha do plantão: horário em Brasília, médico ou DESCOBERTO", () => {
  assertEquals(linhaPlantao(P({})), "- 07:00–19:00 · UTI: Ana Souza (Normal, Designado)");
  assertEquals(linhaPlantao(P({ profissional_crm: "12345" }), true), "- 07:00–19:00 · CEPON · UTI: Ana Souza (CRM 12345) (Normal, Designado)");
  // Furo não mostra situação nem nome: a situação do furo no Dr. Escala é "Anunciado" e confunde.
  assertEquals(linhaPlantao(P({ furo: true, profissional_nome: null, situacao: "Anunciado" })), "- 07:00–19:00 · UTI: **DESCOBERTO** (Normal)");
  assertEquals(linhaPlantao(P({ fim: null, setor: null, tipo: null, situacao: null })), "- 07:00–? · sem setor: Ana Souza");
});

Deno.test("agrupa por dia e, com vários hospitais, por hospital", () => {
  const rows = [P({ id: 1 }), P({ id: 2, hospital: "HRO" }), P({ id: 3, data: "2026-11-14" })];
  const porDia = agrupar(rows, false);
  assertEquals(porDia.match(/###/g)?.length, 2);
  const porHosp = agrupar(rows, true);
  assertEquals(porHosp.match(/###/g)?.length, 3);
  assert(porHosp.includes("### sex 13/11/2026 · HRO"));
});

Deno.test("resumo dos descobertos por hospital, maior primeiro", () => {
  const rows = [P({ hospital: "B" }), P({ hospital: "A" }), P({ hospital: "B" }), P({ hospital: null })];
  assertEquals(resumoPorHospital(rows), "B: 2; ?: 1; A: 1");
});

Deno.test("médico por CRM ou por nome, sem curinga do usuário", () => {
  assertEquals(filtroProfissional("12.345/SC"), { coluna: "profissional_crm", padrao: "%12345%" });
  assertEquals(filtroProfissional("  ana_sou%za "), { coluna: "profissional_nome", padrao: "%anasouza%" });
});
