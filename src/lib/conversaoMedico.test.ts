// Trava de envio a Contratos (npm test). Cenários do teste da Bianca com o Vinicius em 26/11/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  camposObrigatoriosConversao,
  dadosConversaoDoLead,
  pendenciasConversao,
  type DadosConversao,
} from "./conversaoMedico";

const propostaComValor = { proposta_itens: [{ valor_medico: 1500 }] };

const pf: DadosConversao = {
  nome: "Maria Aparecida Souza",
  cpf: "529.982.247-25",
  crm: "CRM/SC 12345",
  telefone: "+5547999990000",
  email: "maria@exemplo.com",
  unidades: ["unidade-1"],
  modalidade: "Pessoa Física",
  propostas: [propostaComValor],
};

const pj: DadosConversao = {
  ...pf,
  modalidade: "Pessoa Jurídica",
  cnpj: "11.222.333/0001-81",
  representanteNome: "Maria Aparecida Souza",
  representanteEmail: "contato@clinicamaria.com.br",
};

test("PF completo: passa", () => {
  assert.deepEqual(pendenciasConversao(pf), []);
});

test("PF sem CRM: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, crm: "" }), ["CRM"]);
  assert.deepEqual(pendenciasConversao({ ...pf, crm: "   " }), ["CRM"]);
  assert.deepEqual(pendenciasConversao({ ...pf, crm: null }), ["CRM"]);
});

test("CRM 'PENDENTE' (o que a conversão antiga gravava) ou sem número: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, crm: "PENDENTE" }), ["CRM sem número"]);
  assert.deepEqual(pendenciasConversao({ ...pf, crm: "SC" }), ["CRM sem número"]);
});

test("PJ sem CNPJ: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "" }), ["CNPJ"]);
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: null }), ["CNPJ"]);
});

test("PJ com CNPJ incompleto ou com dígito errado: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "11.222.333/0001" }), ["CNPJ incompleto"]);
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "11.222.333/0001-82" }), ["CNPJ inválido"]);
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "00.000.000/0000-00" }), ["CNPJ inválido"]);
});

test("PJ com CNPJ alfanumérico válido (Receita, 07/2026): passa", () => {
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "12.ABC.345/01DE-35" }), []);
  assert.deepEqual(pendenciasConversao({ ...pj, cnpj: "12.ABC.345/01DE-36" }), ["CNPJ inválido"]);
});

test("PJ sem representante legal: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pj, representanteNome: "" }), ["Representante legal"]);
  assert.deepEqual(pendenciasConversao({ ...pj, representanteEmail: "" }), ["E-mail do representante legal"]);
  assert.deepEqual(pendenciasConversao({ ...pj, representanteEmail: "contato@" }), ["E-mail do representante inválido"]);
});

test("PJ completo: passa", () => {
  assert.deepEqual(pendenciasConversao(pj), []);
});

test("Ambas (PF e PJ): exige CNPJ e representante; completo passa", () => {
  const ambas = { ...pj, modalidade: "Ambas (PF e PJ)" };
  assert.deepEqual(pendenciasConversao(ambas), []);
  assert.deepEqual(pendenciasConversao({ ...ambas, cnpj: "", representanteNome: "", representanteEmail: "" }), [
    "CNPJ",
    "Representante legal",
    "E-mail do representante legal",
  ]);
});

test("modalidades com PJ do banco antigo também exigem os dados da empresa", () => {
  for (const modalidade of ["PJ", "Pessoa Jurídica e Sócio", "PF Condicionada a PJ"]) {
    assert.deepEqual(pendenciasConversao({ ...pf, modalidade, cnpj: "" }), [
      "CNPJ",
      "Representante legal",
      "E-mail do representante legal",
    ], modalidade);
  }
});

test("PF não pede CNPJ nem representante", () => {
  const campos = camposObrigatoriosConversao(pf).map((c) => c.campo);
  assert.ok(!campos.includes("CNPJ"));
  assert.ok(!campos.includes("Representante legal"));
});

test("e-mail ausente ou inválido: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, email: "" }), ["E-mail"]);
  assert.deepEqual(pendenciasConversao({ ...pf, email: "maria@exemplo" }), ["E-mail inválido"]);
  assert.deepEqual(pendenciasConversao({ ...pf, email: "maria exemplo.com" }), ["E-mail inválido"]);
});

test("modalidade ausente: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, modalidade: "" }), ["Modalidade de contrato"]);
  assert.deepEqual(pendenciasConversao({ ...pf, modalidade: null }), ["Modalidade de contrato"]);
});

test("unidade ausente: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, unidades: [] }), ["Local de atuação (Unidades)"]);
  assert.deepEqual(pendenciasConversao({ ...pf, unidades: null }), ["Local de atuação (Unidades)"]);
});

test("CPF ausente, incompleto ou inválido: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, cpf: "" }), ["CPF"]);
  assert.deepEqual(pendenciasConversao({ ...pf, cpf: "529.982.247" }), ["CPF incompleto"]);
  assert.deepEqual(pendenciasConversao({ ...pf, cpf: "529.982.247-26" }), ["CPF inválido"]);
  assert.deepEqual(pendenciasConversao({ ...pf, cpf: "111.111.111-11" }), ["CPF inválido"]);
});

test("nome e telefone ausentes: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, nome: " ", telefone: "" }), ["Nome", "Telefone"]);
});

test("proposta zerada (R$ 0,00): bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: [{ valor_medico: 0 }] }] }), [
    "Proposta com item sem valor para o médico",
  ]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: [{ valor_medico: "0.00" }] }] }), [
    "Proposta com item sem valor para o médico",
  ]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: [{ valor_medico: null }] }] }), [
    "Proposta com item sem valor para o médico",
  ]);
});

test("proposta com um item com valor e outro em R$ 0,00: bloqueia (antes passava)", () => {
  const p = { proposta_itens: [{ valor_medico: 1500 }, { valor_medico: 0 }] };
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [p] }), ["Proposta com item sem valor para o médico"]);
});

test("uma proposta com valor não salva outra zerada do mesmo lead (antes passava)", () => {
  const zerada = { proposta_itens: [{ valor_medico: 0 }] };
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [propostaComValor, zerada] }), [
    "Proposta com item sem valor para o médico",
  ]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [zerada, { proposta_itens: [] }] }), [
    "2 propostas com item sem valor para o médico",
  ]);
});

test("proposta sem item ou nenhuma proposta: bloqueia", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: [] }] }), [
    "Proposta com item sem valor para o médico",
  ]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: null }] }), [
    "Proposta com item sem valor para o médico",
  ]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [] }), ["Proposta Vinculada"]);
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: null }), ["Proposta Vinculada"]);
});

test("valor do médico vindo do banco como texto ('1500.00') conta como valor", () => {
  assert.deepEqual(pendenciasConversao({ ...pf, propostas: [{ proposta_itens: [{ valor_medico: "1500.00" }] }] }), []);
});

test("cadastro vazio lista tudo o que falta, na ordem da tela", () => {
  assert.deepEqual(pendenciasConversao({}), [
    "Nome",
    "CPF",
    "CRM",
    "Telefone",
    "E-mail",
    "Local de atuação (Unidades)",
    "Modalidade de contrato",
    "Proposta Vinculada",
  ]);
});

test("dadosConversaoDoLead lê a linha de leads com CRM e representante (mesmo mapeamento da conversão)", () => {
  const lead = {
    nome: "Maria Aparecida Souza",
    cpf: "52998224725",
    crm: "12345",
    phone_e164: "+5547999990000",
    email: "maria@exemplo.com",
    unidades_vinculadas: ["u1"],
    modalidade_contrato: "Ambas (PF e PJ)",
    cnpj: "11222333000181",
    representante_legal_nome: "Maria",
    representante_legal_email: "maria@clinica.com.br",
  };
  assert.deepEqual(pendenciasConversao(dadosConversaoDoLead(lead, [propostaComValor])), []);
  assert.deepEqual(pendenciasConversao(dadosConversaoDoLead({ ...lead, crm: null, cnpj: null }, [propostaComValor])), [
    "CRM",
    "CNPJ",
  ]);
});
