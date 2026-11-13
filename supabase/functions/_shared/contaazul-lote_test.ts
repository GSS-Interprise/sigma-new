// Completude do lote no Conta Azul (Maria, 13/11: Arthur Blois ficou fora do lançamento e ninguém avisou).
// Roda sem Deno: node --experimental-strip-types --test supabase/functions/_shared/contaazul-lote_test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bloqueioDeEnvio, conferirLote, lancarItens, SEM_CONFIRMACAO, type ItemLancar, type PagLote } from "./contaazul-lote.ts";

const NOMES = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Rocha", "Elisa Prado", "Fabio Melo", "Gabriela Reis",
  "Heitor Nunes", "Ines Barros", "Arthur Blois de Mattos"];
const ARTHUR = "pag-10";

/** Banco de mentira com a mesma trava do UPDATE condicional da edge (ca_evento_id nulo e ca_erro ≠ "enviando"). */
function cenario(nomes = NOMES) {
  const banco = new Map<string, PagLote>(nomes.map((n, i) => [`pag-${i + 1}`, {
    id: `pag-${i + 1}`, profissional_nome: n, unidade: "REDEH Navegantes", arquivo_origem: "REDEH Navegantes - outubro.xlsx",
    valor_total: 1000 + i, conferido_em: "2026-11-05T12:00:00Z", status: "pendente", nf_status: "conferida",
    ca_evento_id: null, ca_erro: null,
  }]));
  const postados: string[] = []; // referencia_externa de cada POST ao Conta Azul
  let semIdPara: string | null = null; // simula o Conta Azul aceitando sem devolver o id
  const deps = {
    travar: async (id: string) => {
      const p = banco.get(id)!;
      if (p.ca_evento_id != null || p.ca_erro === "enviando") return false;
      p.ca_erro = "enviando";
      return true;
    },
    enviar: async (payload: Record<string, unknown>) => {
      const ref = String(payload.referencia_externa);
      postados.push(ref);
      return ref === `sigma-pag-${semIdPara}` ? {} : { id: `ca-${ref}`, condicao_pagamento: { parcelas: [{ id: `parc-${ref}` }] } };
    },
    confirmar: async (it: ItemLancar, eventoId: string) => { Object.assign(banco.get(it.id)!, { ca_evento_id: eventoId, ca_erro: null }); },
    falhar: async (id: string, msg: string) => { banco.get(id)!.ca_erro = msg; },
  };
  // o que a prévia (montarPagar) entrega: já lançado e envio sem confirmação viram problema, o resto vai pronto
  const montar = (ids: string[], problemasExtra: Record<string, string[]> = {}): ItemLancar[] => ids.map((id) => {
    const p = banco.get(id)!;
    const bloq = bloqueioDeEnvio(p);
    const problemas = [...(p.ca_evento_id ? ["Já lançado no Conta Azul."] : []), ...(bloq ? [bloq] : []), ...(problemasExtra[id] ?? [])];
    return { id, medico: p.profissional_nome, problemas, payload: { referencia_externa: `sigma-pag-${id}`, valor: p.valor_total } };
  });
  return { banco, postados, deps, montar, semId: (id: string) => { semIdPara = id; } };
}
const todos = () => NOMES.map((_, i) => `pag-${i + 1}`);

test("lote completo: 10 médicos lançados, sem alerta", async () => {
  const c = cenario();
  const res = await lancarItens(c.montar(todos()), c.deps);
  assert.equal(res.filter((r) => r.ok).length, 10);
  const lote = conferirLote([...c.banco.values()]);
  assert.deepEqual({ esperados: lote.esperados, confirmados: lote.confirmados, completo: lote.completo }, { esperados: 10, confirmados: 10, completo: true });
  assert.equal(lote.pendentes.length, 0);
  assert.equal(c.postados.length, 10);
});

test("1 de 10 com pendência na prévia: lote incompleto e alerta com o nome do Arthur", async () => {
  const c = cenario();
  const problemas = { [ARTHUR]: ["Há 2 fornecedores com este CNPJ no Conta Azul: escolher o do médico."] };
  const itens = c.montar(todos(), problemas);
  const res = await lancarItens(itens, c.deps);
  assert.equal(res.filter((r) => r.ok).length, 9);
  assert.equal(c.postados.length, 9);
  const lote = conferirLote([...c.banco.values()], Object.fromEntries(itens.map((i) => [i.id, i.problemas])));
  assert.equal(lote.completo, false);
  assert.equal(lote.confirmados, 9);
  assert.equal(lote.esperados, 10);
  assert.equal(lote.pendentes.length, 1);
  assert.equal(lote.pendentes[0].medico, "Arthur Blois de Mattos");
  assert.equal(lote.pendentes[0].tipo, "falta_resolver");
  assert.match(lote.pendentes[0].motivo, /2 fornecedores/);
});

test("médico omitido da seleção (não enviado) aparece no alerta do fechamento", async () => {
  const c = cenario();
  await lancarItens(c.montar(todos().filter((id) => id !== ARTHUR)), c.deps);
  const lote = conferirLote([...c.banco.values()]);
  assert.equal(lote.completo, false);
  assert.deepEqual(lote.pendentes.map((p) => [p.medico, p.tipo]), [["Arthur Blois de Mattos", "nao_enviado"]]);
});

test("repetição controlada: lançar os 10 de novo só envia o Arthur, sem duplicar os 9", async () => {
  const c = cenario();
  await lancarItens(c.montar(todos().filter((id) => id !== ARTHUR)), c.deps);
  assert.equal(c.postados.length, 9);
  // nova tentativa com os 10 selecionados: a prévia marca os 9 como já lançados
  const res = await lancarItens(c.montar(todos()), c.deps);
  assert.equal(res.filter((r) => r.ok).length, 1);
  assert.equal(c.postados.length, 10);
  assert.equal(new Set(c.postados).size, 10, "nenhum médico enviado duas vezes");
  assert.equal(conferirLote([...c.banco.values()]).completo, true);
});

test("prévia desatualizada (dois cliques ou duas abas): a trava não deixa reenviar quem já foi", async () => {
  const c = cenario();
  const itens = c.montar(todos());
  await lancarItens(itens, c.deps);
  // mesmos itens, ainda sem o "Já lançado" da prévia: só a trava do banco segura
  const res = await lancarItens(itens, c.deps);
  assert.equal(res.filter((r) => r.ok).length, 0);
  assert.ok(res.every((r) => r.erro === "já lançado ou em envio"));
  assert.equal(c.postados.length, 10);
  assert.equal(new Set(c.postados).size, 10);
});

test("Conta Azul aceita sem devolver o id: não conta como lançado, alerta e não reenvia", async () => {
  const c = cenario();
  c.semId(ARTHUR);
  const res = await lancarItens(c.montar(todos()), c.deps);
  assert.equal(res.find((r) => r.id === ARTHUR)?.ok, false);
  assert.equal(c.banco.get(ARTHUR)!.ca_evento_id, null);
  assert.ok(String(c.banco.get(ARTHUR)!.ca_erro).startsWith(SEM_CONFIRMACAO));
  const lote = conferirLote([...c.banco.values()]);
  assert.equal(lote.completo, false);
  assert.deepEqual(lote.pendentes.map((p) => [p.medico, p.tipo]), [["Arthur Blois de Mattos", "sem_confirmacao"]]);
  // nova tentativa: a prévia bloqueia o Arthur (pode já existir no Conta Azul), nada é reenviado
  c.semId("ninguem");
  await lancarItens(c.montar(todos()), c.deps);
  assert.equal(c.postados.filter((r) => r === `sigma-pag-${ARTHUR}`).length, 1);
});

test("envio interrompido (ficou em 'enviando') e erro do Conta Azul entram no alerta com o motivo", () => {
  const c = cenario();
  for (const [id, p] of c.banco) if (id !== "pag-1" && id !== "pag-2") p.ca_evento_id = `ca-${id}`;
  c.banco.get("pag-1")!.ca_erro = "enviando";
  c.banco.get("pag-2")!.ca_erro = "contaazul_400:Fornecedor inativo";
  const lote = conferirLote([...c.banco.values()]);
  assert.equal(lote.confirmados, 8);
  assert.deepEqual(lote.pendentes.map((p) => p.tipo), ["envio_interrompido", "erro"]);
  assert.match(lote.pendentes[1].motivo, /Fornecedor inativo/);
  assert.doesNotMatch(lote.pendentes[1].motivo, /contaazul_400/);
});

test("id vazio gravado por versão antiga conta como não confirmado e bloqueia o reenvio", () => {
  const p: PagLote = { id: "x", profissional_nome: "Arthur", valor_total: 10, conferido_em: "2026-11-01", ca_evento_id: "", ca_erro: null };
  assert.equal(conferirLote([p]).pendentes[0]?.tipo, "sem_confirmacao");
  assert.ok(bloqueioDeEnvio(p));
});

test("fora do esperado: não liberado, valor zero (dispensada) e pago por fora do Sigma", () => {
  const base = { profissional_nome: "X", ca_evento_id: null, ca_erro: null };
  const lote = conferirLote([
    { ...base, id: "a", valor_total: 500, conferido_em: null },
    { ...base, id: "b", valor_total: 0, conferido_em: "2026-11-01", nf_status: "dispensada" },
    { ...base, id: "c", valor_total: 500, conferido_em: "2026-11-01", status: "pago" },
    { ...base, id: "d", valor_total: 500, conferido_em: "2026-11-01", status: "pago", ca_evento_id: "ca-d" },
  ]);
  assert.deepEqual({ esperados: lote.esperados, confirmados: lote.confirmados, pendentes: lote.pendentes.length }, { esperados: 1, confirmados: 1, pendentes: 0 });
});
