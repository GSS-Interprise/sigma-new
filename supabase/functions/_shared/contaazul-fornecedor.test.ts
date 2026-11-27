// Fornecedor do médico entre vários cadastros do mesmo CNPJ no Conta Azul (npm test).
// Caso da Mavi em 27/11/2026, fechamento de Vacaria: Anderson Gottems e Léo Graciolli Franco ficaram em
// "Falta resolver" porque os cadastros "MÉDICO/BAMBINO..." deles não têm CNPJ no Conta Azul; só a própria
// Bambino e outro médico têm. CNPJ e razão social daqui são fictícios.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cadastrosDoCnpj, escolherFornecedor, pessoasPorDocumento } from "./contaazul-fornecedor.ts";

const CNPJ = "12345678000190";
const CNPJ_FORMATADO = "12.345.678/0001-90";
const pessoa = (ca_id: string, nome: string, documento?: string | null) => ({ tipo: "pessoa", ca_id, nome, dados: { documento } });

// como está no Conta Azul: caixa, acento, espaço em volta da barra e pontuação variam de cadastro para cadastro
const bambino = pessoa("ca-bambino", "BAMBINO SERVIÇOS MÉDICOS LTDA", CNPJ_FORMATADO);
const nilton = pessoa("ca-nilton", "NILTON EXEMPLO/BAMBINO SERVICOS MEDICOS LTDA", CNPJ);
const anderson = pessoa("ca-anderson", "ANDERSON GOTTEMS/BAMBINO SERVICOS MEDICOS LTDA", null);
const leo = pessoa("ca-leo", "LÉO GRACIOLLI FRANCO / Bambino Serviços Médicos Ltda.", "");
const vacaria = [bambino, nilton, anderson, leo];

const ids = (lista: { ca_id: string }[]) => lista.map((c) => c.ca_id).sort();

test("cadastro MÉDICO/RAZÃO sem CNPJ entra entre os do CNPJ da mesma razão social", () => {
  const cands = cadastrosDoCnpj(pessoasPorDocumento(vacaria), CNPJ);
  assert.deepEqual(ids(cands), ["ca-anderson", "ca-bambino", "ca-leo", "ca-nilton"]);
});

test("CNPJ formatado ou só com dígitos acha os mesmos cadastros", () => {
  const mapa = pessoasPorDocumento(vacaria);
  assert.deepEqual(ids(cadastrosDoCnpj(mapa, CNPJ_FORMATADO)), ids(cadastrosDoCnpj(mapa, CNPJ)));
  assert.equal(cadastrosDoCnpj(mapa, CNPJ_FORMATADO).length, 4);
});

test("Anderson Gottems e Léo Graciolli Franco: o Sigma escolhe o cadastro de cada um", () => {
  for (const cnpj of [CNPJ, CNPJ_FORMATADO]) {
    const cands = cadastrosDoCnpj(pessoasPorDocumento(vacaria), cnpj);
    assert.deepEqual(escolherFornecedor(cands, "Anderson Gottems"), { escolhido: anderson, ambiguo: false });
    for (const nome of ["Léo Graciolli Franco", "LEO GRACIOLLI FRANCO", "leo  graciolli-franco", "Léo Graciolli"]) {
      assert.deepEqual(escolherFornecedor(cands, nome), { escolhido: leo, ambiguo: false }, nome);
    }
  }
});

test("a escolha não depende da ordem dos cadastros", () => {
  const cands = cadastrosDoCnpj(pessoasPorDocumento([...vacaria].reverse()), CNPJ);
  assert.equal(escolherFornecedor(cands, "Anderson Gottems").escolhido, anderson);
  assert.equal(escolherFornecedor([...cands].reverse(), "Léo Graciolli Franco").escolhido, leo);
});

test("empate ou nome que não basta continua ambíguo (Falta resolver), sem escolher nenhum", () => {
  const cands = cadastrosDoCnpj(pessoasPorDocumento(vacaria), CNPJ);
  // nome que não é de nenhum cadastro e só o primeiro nome (1 de 2 palavras: abaixo do mínimo de 60%)
  for (const nome of ["Maria Souza", "Anderson"]) {
    assert.deepEqual(escolherFornecedor(cands, nome), { escolhido: null, ambiguo: true }, nome);
  }
  // dois cadastros do mesmo médico no mesmo CNPJ: empate, nos dois sentidos da lista
  const duplicado = pessoa("ca-anderson-2", "Anderson Gottems / BAMBINO SERVICOS MEDICOS LTDA", CNPJ_FORMATADO);
  const comDuplicado = cadastrosDoCnpj(pessoasPorDocumento([...vacaria, duplicado]), CNPJ);
  assert.deepEqual(escolherFornecedor(comDuplicado, "Anderson Gottems"), { escolhido: null, ambiguo: true });
  assert.deepEqual(escolherFornecedor([...comDuplicado].reverse(), "Anderson Gottems"), { escolhido: null, ambiguo: true });
});

test("razão social de dois CNPJs: o cadastro sem CNPJ não entra em nenhum", () => {
  const outroCnpj = pessoa("ca-bambino-filial", "BAMBINO SERVICOS MEDICOS LTDA", "12.345.678/0002-71");
  const mapa = pessoasPorDocumento([...vacaria, outroCnpj]);
  assert.deepEqual(ids(cadastrosDoCnpj(mapa, CNPJ)), ["ca-bambino", "ca-nilton"]);
  assert.deepEqual(ids(cadastrosDoCnpj(mapa, "12345678000271")), ["ca-bambino-filial"]);
});

test("um cadastro só no CNPJ é o fornecedor; nenhum, nada", () => {
  assert.deepEqual(escolherFornecedor([nilton], "Qualquer Nome"), { escolhido: nilton, ambiguo: false });
  assert.deepEqual(escolherFornecedor([], "Anderson Gottems"), { escolhido: null, ambiguo: false });
  assert.deepEqual(cadastrosDoCnpj(pessoasPorDocumento(vacaria), "99.999.999/0001-99"), []);
});
