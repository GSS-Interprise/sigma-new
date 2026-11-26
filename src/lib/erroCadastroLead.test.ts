import { test } from "node:test";
import assert from "node:assert/strict";
import { lerErroCadastroLead } from "./erroCadastroLead";

const ID = "241ea936-9b45-4ca3-8c6c-666188f11ec3";

// Erros como o PostgREST devolve ao supabase-js: { code, message, details, hint }.
test("CPF repetido: mantém a frase do gatilho e devolve o cadastro que já existe", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message:
      "Este médico já está cadastrado no Sigma: FABRICIO PRAÇA CONSALTER (CRM 12345), com o mesmo CPF. Abra esse cadastro e atualize por lá, em vez de criar outro.",
    details: `lead_existente=${ID} chave=cpf`,
    hint: null,
  });
  assert.equal(r.duplicado, true);
  assert.equal(r.leadExistenteId, ID);
  assert.match(r.mensagem, /FABRICIO PRAÇA CONSALTER \(CRM 12345\), com o mesmo CPF/);
});

test("nome + data de nascimento repetidos: mantém a frase do gatilho e devolve o cadastro", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message:
      "Este médico já está cadastrado no Sigma: Maria Souza, com o mesmo nome e data de nascimento. Abra esse cadastro e atualize por lá, em vez de criar outro.",
    details: `lead_existente=${ID} chave=nome_nascimento`,
  });
  assert.equal(r.leadExistenteId, ID);
  assert.match(r.mensagem, /mesmo nome e data de nascimento/);
});

test("frase da versão anterior do gatilho (já em produção) também abre o cadastro", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message: "Este médico já está cadastrado no Sigma: Maria Souza. Procure pelo nome em Leads e edite o cadastro que já existe.",
    details: `lead_existente=${ID} chave=cpf`,
  });
  assert.equal(r.leadExistenteId, ID);
  assert.match(r.mensagem, /^Este médico já está cadastrado no Sigma: Maria Souza/);
});

test("erro cru do idx_leads_chave_unica nunca chega à tela", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message: 'duplicate key value violates unique constraint "idx_leads_chave_unica"',
    details: "Key (chave_unica)=(cpf_04512345678) already exists.",
  });
  assert.equal(r.duplicado, true);
  assert.equal(r.leadExistenteId, null);
  assert.doesNotMatch(r.mensagem, /duplicate key|idx_leads|constraint/i);
  assert.match(r.mensagem, /mesmo CPF ou o mesmo nome e data de nascimento/);
});

test("erro cru do idx_leads_cpf_unique (CPF em lead fundido) vira texto de CPF", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message: 'duplicate key value violates unique constraint "idx_leads_cpf_unique"',
  });
  assert.doesNotMatch(r.mensagem, /duplicate key|idx_leads/i);
  assert.match(r.mensagem, /Este CPF já está em outro cadastro/);
});

test("telefone repetido vira texto de telefone", () => {
  const r = lerErroCadastroLead({
    code: "23505",
    message: 'duplicate key value violates unique constraint "leads_phone_e164_unique"',
  });
  assert.match(r.mensagem, /Este telefone já está em outro cadastro/);
});

test("outra unicidade sem nome conhecido ainda não mostra SQL", () => {
  const r = lerErroCadastroLead({ message: 'duplicate key value violates unique constraint "x_key"' });
  assert.equal(r.duplicado, true);
  assert.doesNotMatch(r.mensagem, /duplicate key|x_key/);
});

test("erro que não é de duplicidade passa como veio, e vazio usa o padrão", () => {
  assert.deepEqual(lerErroCadastroLead(new Error("Nome é obrigatório")), {
    mensagem: "Nome é obrigatório",
    leadExistenteId: null,
    duplicado: false,
  });
  assert.equal(lerErroCadastroLead(null, "Erro ao salvar alterações").mensagem, "Erro ao salvar alterações");
});
