import { test } from "node:test";
import assert from "node:assert/strict";
import { exigeHoras, fmtHoras, lerHoras, minutosPrevistos, validarAjuste, type FormAjuste } from "./ajusteHoras";
import { COLUNAS_PAGAMENTO, resumoProducao, type Pag } from "../../../supabase/functions/financeiro-nf-enviar/texto";

const H = 60;
const form = (f: Partial<FormAjuste>): FormAjuste => ({
  categoria_id: "cat", categoria_nome: "Correção de escala", sinal: "mais",
  valor: "", horas: "", justificativa: "fez 74 h, não 72 h", ...f,
});
const pag = (min: number): Pag => ({
  id: "p1", profissional_nome: "Isabela", medico_id: "m1", mes_referencia: 9, ano_referencia: 2026,
  unidade: "UTI", setor: null, total_plantoes: 6, total_horas_minutos: min, valor_total: 11592,
  arquivo_origem: "[cfg:x] Ibirama - setembroo.xlsx", nf_lembretes: 0,
});

test("lerHoras aceita os formatos que a equipe digita", () => {
  assert.equal(lerHoras("2"), 2 * H);
  assert.equal(lerHoras("2:30"), 150);
  assert.equal(lerHoras("2h30"), 150);
  assert.equal(lerHoras("2h"), 120);
  assert.equal(lerHoras("2,5"), 150);
  assert.equal(lerHoras(""), 0);
  assert.equal(lerHoras("duas"), null);
  assert.equal(fmtHoras(74 * H), "74h");
  assert.equal(fmtHoras(-150), "−2h30");
});

// Caso da Maria (18/11): salvou "Correção de escala" só com o valor e as horas do pedido de NF não mudaram.
test("correção de escala sem horas não salva", () => {
  const v = validarAjuste(form({ valor: "322,00" }));
  assert.equal(v.ok, false);
  assert.equal(v.faltaHoras, true);
  assert.equal(exigeHoras("Correção de escala"), true);
  assert.equal(exigeHoras("CORRECAO DE ESCALA"), true);
});

test("correção de escala com +2h grava +120 minutos; com −2h grava −120", () => {
  const mais = validarAjuste(form({ valor: "322,00", horas: "2" }));
  assert.deepEqual([mais.ok, mais.valor, mais.minutos], [true, 322, 120]);
  const menos = validarAjuste(form({ sinal: "menos", valor: "322,00", horas: "2" }));
  assert.deepEqual([menos.ok, menos.valor, menos.minutos], [true, -322, -120]);
});

test("correção de escala aceita 0 h dito de propósito (carga igual, valor diferente)", () => {
  const v = validarAjuste(form({ valor: "150,00", horas: "0" }));
  assert.deepEqual([v.ok, v.minutos, v.valor], [true, 0, 150]);
});

test("ajuste só de valor (outras categorias) continua valendo e não mexe nas horas", () => {
  const v = validarAjuste(form({ categoria_nome: "Gestão", valor: "200,00" }));
  assert.deepEqual([v.ok, v.valor, v.minutos], [true, 200, 0]);
  assert.equal(minutosPrevistos(72 * H, 0, v.minutos), 72 * H);
});

test("ajuste vazio continua inválido, em qualquer categoria", () => {
  assert.equal(validarAjuste(form({ categoria_nome: "Gestão" })).ok, false);
  assert.equal(validarAjuste(form({ horas: "0" })).ok, false);
  assert.equal(validarAjuste(form({ horas: "2", justificativa: "  " })).ok, false);
  assert.equal(validarAjuste(form({ horas: "duas" })).horasInvalidas, true);
});

test("prévia das horas: 72h +2h = 74h, 72h −2h = 70h e nunca negativa", () => {
  assert.equal(minutosPrevistos(72 * H, 0, 2 * H), 74 * H);
  assert.equal(minutosPrevistos(72 * H, 0, -2 * H), 70 * H);
  assert.equal(minutosPrevistos(1 * H, 0, -2 * H), 0);
});

test("editar o ajuste troca as horas, não soma de novo", () => {
  // pagamento já está em 74h por um ajuste de +2h; a edição muda para +3h → 75h (e não 77h)
  assert.equal(minutosPrevistos(74 * H, 2 * H, 3 * H), 75 * H);
  // salvar de novo sem mudar nada mantém 74h
  assert.equal(minutosPrevistos(74 * H, 2 * H, 2 * H), 74 * H);
});

test("pedido de NF usa total_horas_minutos (carga corrigida), não a base", () => {
  assert.match(COLUNAS_PAGAMENTO, /\btotal_horas_minutos\b/);
  assert.doesNotMatch(COLUNAS_PAGAMENTO, /minutos_produzidos/);
  assert.equal(resumoProducao(pag(74 * H), []), "74 horas");
  assert.equal(resumoProducao(pag(70 * H), []), "70 horas");
});
