import { test } from "node:test";
import assert from "node:assert/strict";
import { pendenciasAoFechar, temConteudo } from "./pendenciasAoFechar";

const carregadas = new Set(["decorrencia_analise", "deliberacao"]);

test("sem mudança, nada a gravar (fechar não faz update)", () => {
  const gravado = { decorrencia_analise: "<p>análise</p>", deliberacao: "" };
  assert.deepEqual(pendenciasAoFechar({ ...gravado }, gravado, carregadas), {});
});

test("texto alterado na Decorrência entra; o resto do formulário não", () => {
  const gravado = { decorrencia_analise: "<p>análise</p>", deliberacao: "", status: "em_analise", titulo: "A" };
  const form = { ...gravado, decorrencia_analise: "<p>análise <b>corrigida</b></p>", status: "descarte", titulo: "B" };
  assert.deepEqual(pendenciasAoFechar(form, gravado, carregadas), {
    decorrencia_analise: "<p>análise <b>corrigida</b></p>",
  });
});

test("Deliberação alterada também entra", () => {
  const gravado = { decorrencia_analise: "<p>a</p>", deliberacao: "" };
  const form = { ...gravado, deliberacao: "<p>participar</p>" };
  assert.deepEqual(pendenciasAoFechar(form, gravado, carregadas), { deliberacao: "<p>participar</p>" });
});

test("texto apagado por inteiro não é gravado ao fechar", () => {
  const gravado = { decorrencia_analise: "<p>análise</p>", deliberacao: "<p>x</p>" };
  const form = { decorrencia_analise: "<p><br></p>", deliberacao: "" };
  assert.deepEqual(pendenciasAoFechar(form, gravado, carregadas), {});
});

test("coluna que não veio do banco não é gravada (não apaga o que está lá)", () => {
  const gravado = { decorrencia_analise: "", deliberacao: "" };
  const form = { decorrencia_analise: "<p>novo</p>", deliberacao: "" };
  assert.deepEqual(pendenciasAoFechar(form, gravado, new Set(["deliberacao"])), {});
});

test("formulário limpo pelo fechamento ou edição cancelada: nada a gravar", () => {
  assert.deepEqual(pendenciasAoFechar({}, { decorrencia_analise: "<p>a</p>" }, carregadas), {});
  assert.deepEqual(pendenciasAoFechar(null, { decorrencia_analise: "<p>a</p>" }, carregadas), {});
  assert.deepEqual(pendenciasAoFechar({ decorrencia_analise: "<p>b</p>" }, null, carregadas), {});
});

test("temConteudo: espaço e quebra não contam, imagem conta", () => {
  assert.equal(temConteudo(""), false);
  assert.equal(temConteudo("<p>&nbsp; </p><p><br></p>"), false);
  assert.equal(temConteudo('<p><img src="x.png"></p>'), true);
  assert.equal(temConteudo("<p>ok</p>"), true);
});
