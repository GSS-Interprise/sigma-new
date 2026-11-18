import { test } from "node:test";
import assert from "node:assert/strict";
import { medicoFormSchema, registroProfissional } from "./medicoFormSchema";

const base = {
  nome_completo: "Maria Aparecida Souza",
  prestador_nao_medico: false,
  crm: "",
  especialidade: [] as string[],
  rqe_numeros: "",
  email: "maria@exemplo.com",
  telefone: "(47) 99999-0000",
  cpf: "",
  status_medico: "Ativo" as const,
  unidades_vinculadas: [] as string[],
};

const erros = (v: unknown) => {
  const r = medicoFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

test("prestador: salva sem CRM e sem especialidade", () => {
  assert.deepEqual(erros({ ...base, prestador_nao_medico: true }), []);
});

test("prestador: continua exigindo nome, e-mail e telefone", () => {
  const e = erros({ ...base, prestador_nao_medico: true, nome_completo: "Jo", email: "sem-arroba", telefone: "123" });
  assert.deepEqual(e.sort(), ["email", "nome_completo", "telefone"]);
});

test("médico: CRM e especialidade continuam obrigatórios", () => {
  assert.deepEqual(erros(base).sort(), ["crm", "especialidade"]);
});

test("médico: com CRM e especialidade passa", () => {
  assert.deepEqual(erros({ ...base, crm: "12345-SC", especialidade: ["Pediatria"] }), []);
});

test("médico: CRM só com espaços não conta", () => {
  assert.deepEqual(erros({ ...base, crm: "    ", especialidade: ["Pediatria"] }), ["crm"]);
});

test("payload do prestador: CRM e especialidade vão nulos (o banco recusa lista vazia)", () => {
  assert.deepEqual(registroProfissional({ ...base, prestador_nao_medico: true }), {
    prestador_nao_medico: true, crm: null, especialidade: null, rqe_numeros: null,
  });
});

test("payload: marcar prestador num médico não apaga o CRM digitado", () => {
  const p = registroProfissional({ ...base, prestador_nao_medico: true, crm: " 12345 ", especialidade: ["Pediatria"] });
  assert.equal(p.crm, "12345");
  assert.deepEqual(p.especialidade, ["Pediatria"]);
});

test("payload do médico: RQEs separados por vírgula", () => {
  const p = registroProfissional({ ...base, crm: "12345", especialidade: ["Pediatria"], rqe_numeros: " 111, 222 ,," });
  assert.deepEqual(p, { prestador_nao_medico: false, crm: "12345", especialidade: ["Pediatria"], rqe_numeros: ["111", "222"] });
});
