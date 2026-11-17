// Regressão do caso Suzana Martins Cardo (16/11/2026): o cadastro pelo Kanban de médicos não pode
// confirmar sucesso quando o médico ou o card não foram criados.
// Rodar: npm run test:cadastro-medico
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CRM_PENDENTE,
  CadastroIncompletoError,
  conferirCrmLivre,
  criarMedicoDoLeadNovo,
  primeiraColunaMedicos,
} from "./cadastroMedico.ts";

type Chamada = { tabela: string; op: string; valores?: unknown; filtros: Array<[string, unknown]> };
type Resposta = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Banco falso que imita o PostgREST no que importa aqui: guarda as linhas, aplica o UNIQUE de
 * `medicos.crm` (constraint da migration 20251002172058) e deixa forçar erro por tabela/operação.
 */
function bancoFalso(inicial: Record<string, Array<Record<string, unknown>>> = {}) {
  const tabelas: Record<string, Array<Record<string, unknown>>> = structuredClone(inicial);
  const chamadas: Chamada[] = [];
  const falhas: Record<string, Resposta["error"]> = {};
  let seq = 0;

  function executar(c: Chamada): Resposta {
    chamadas.push(c);
    const falha = falhas[`${c.tabela}.${c.op}`];
    if (falha) return { data: null, error: falha };
    const linhas = (tabelas[c.tabela] ??= []);
    const casa = (l: Record<string, unknown>) => c.filtros.every(([k, v]) => l[k] === v);
    if (c.op === "select") return { data: linhas.filter(casa), error: null };
    if (c.op === "insert") {
      const nova: Record<string, unknown> = { id: `id-${++seq}`, ...(c.valores as Record<string, unknown>) };
      if (c.tabela === "medicos" && linhas.some((l) => l.crm === nova.crm)) {
        return {
          data: null,
          error: { code: "23505", message: 'duplicate key value violates unique constraint "medicos_crm_key"' },
        };
      }
      linhas.push(nova);
      return { data: [nova], error: null };
    }
    if (c.op === "update") {
      linhas.filter(casa).forEach((l) => Object.assign(l, c.valores));
      return { data: null, error: null };
    }
    if (c.op === "delete") {
      tabelas[c.tabela] = linhas.filter((l) => !casa(l));
      return { data: null, error: null };
    }
    throw new Error(`op ${c.op}`);
  }

  function consulta(tabela: string) {
    const c: Chamada = { tabela, op: "select", filtros: [] };
    const q = {
      select: () => q,
      insert: (v: unknown) => ((c.op = "insert"), (c.valores = v), q),
      update: (v: unknown) => ((c.op = "update"), (c.valores = v), q),
      delete: () => ((c.op = "delete"), q),
      eq: (k: string, v: unknown) => (c.filtros.push([k, v]), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        const r = executar(c);
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      single: async () => {
        const r = executar(c);
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
      },
      then: (ok: (r: Resposta) => unknown, erro?: (e: unknown) => unknown) =>
        Promise.resolve(executar(c)).then(ok, erro),
    };
    return q;
  }

  const db = { from: consulta } as unknown as SupabaseClient;
  return { db, tabelas, chamadas, falhas };
}

const CARD = { nome: "Suzana Martins Cardo", telefone: "+5547999990000" };
const MEDICO = { nome_completo: "Suzana Martins Cardo", telefone: "+5547999990000", status_medico: "Ativo" };

test("caminho feliz: cria médico, card na primeira coluna e lead Convertido", async () => {
  const b = bancoFalso({
    leads: [{ id: "lead-suzana", status: "Novo" }],
    kanban_status_config: [{ modulo: "medicos", status_id: "documentacao", ordem: 1 }],
  });
  const statusId = await primeiraColunaMedicos(b.db);
  const medicoId = await criarMedicoDoLeadNovo(b.db, {
    leadId: "lead-suzana",
    medico: MEDICO,
    crm: "SC 12345",
    kanban: { statusId, card: CARD, userId: "danilo" },
  });

  assert.equal(b.tabelas.medicos[0].id, medicoId);
  assert.equal(b.tabelas.medicos[0].lead_id, "lead-suzana");
  assert.equal(b.tabelas.medicos[0].crm, "SC 12345");
  assert.deepEqual(
    { medico_id: b.tabelas.medico_kanban_cards[0].medico_id, status: b.tabelas.medico_kanban_cards[0].status },
    { medico_id: medicoId, status: "documentacao" },
  );
  assert.equal(b.tabelas.leads[0].status, "Convertido");
  assert.equal(b.tabelas.leads[0].convertido_por, "danilo");
});

test("já existe médico sem CRM: a conferência barra antes de gravar o lead", async () => {
  const b = bancoFalso({ medicos: [{ id: "m-antigo", nome_completo: "Fulano Antigo", crm: CRM_PENDENTE }] });
  await assert.rejects(conferirCrmLivre(b.db, ""), /Informe o CRM.*Fulano Antigo.*Nada foi salvo/);
  await assert.rejects(conferirCrmLivre(b.db, null), /Informe o CRM/);
  await conferirCrmLivre(b.db, "SC 999"); // CRM próprio passa
});

test("CRM já em outro médico: a conferência diz de quem é", async () => {
  const b = bancoFalso({ medicos: [{ id: "m1", nome_completo: "Suzana M. Cardo", crm: "SC 12345" }] });
  await assert.rejects(conferirCrmLivre(b.db, " SC 12345 "), /CRM SC 12345 já está no cadastro.*Suzana M\. Cardo/);
});

test("insert do médico falha (CRM PENDENTE repetido): erro visível e o lead recém-criado é desfeito", async () => {
  // Reproduz o caso: a conferência não viu o conflito (ex.: corrida), o banco recusa pelo UNIQUE.
  const b = bancoFalso({
    leads: [{ id: "lead-suzana", status: "Novo" }],
    medicos: [{ id: "m-antigo", nome_completo: "Fulano Antigo", crm: CRM_PENDENTE }],
  });
  await assert.rejects(
    criarMedicoDoLeadNovo(b.db, {
      leadId: "lead-suzana",
      medico: MEDICO,
      crm: null,
      kanban: { statusId: "documentacao", card: CARD },
    }),
    (e: Error) => !(e instanceof CadastroIncompletoError) && /Informe o CRM.*Nada foi salvo/.test(e.message),
  );
  assert.equal(b.tabelas.leads.length, 0, "lead órfão apagado para a pessoa salvar de novo");
  assert.equal(b.tabelas.medico_kanban_cards, undefined, "nenhum card criado");
  assert.equal(b.tabelas.medicos.length, 1);
});

test("RLS recusa o médico e o lead não pode ser apagado: avisa que o lead ficou em Leads", async () => {
  const b = bancoFalso({ leads: [{ id: "lead-suzana", status: "Novo" }] });
  b.falhas["medicos.insert"] = { code: "42501", message: 'new row violates row-level security policy for table "medicos"' };
  b.falhas["leads.delete"] = { message: "permission denied" };
  await assert.rejects(
    criarMedicoDoLeadNovo(b.db, { leadId: "lead-suzana", medico: MEDICO, crm: "SC 1" }),
    (e: Error) => e instanceof CadastroIncompletoError && /permissão.*ficou salvo em Leads/.test(e.message),
  );
});

test("card do Kanban falha: não confirma sucesso e não marca o lead como Convertido", async () => {
  const b = bancoFalso({ leads: [{ id: "lead-suzana", status: "Novo" }] });
  b.falhas["medico_kanban_cards.insert"] = { message: "violates row-level security policy" };
  await assert.rejects(
    criarMedicoDoLeadNovo(b.db, {
      leadId: "lead-suzana",
      medico: MEDICO,
      crm: "SC 1",
      kanban: { statusId: "documentacao", card: CARD },
    }),
    (e: Error) => e instanceof CadastroIncompletoError && /card do Kanban não foi criado/.test(e.message),
  );
  assert.equal(b.tabelas.leads[0].status, "Novo");
});

test("Kanban de médicos sem coluna: erro antes de gravar", async () => {
  const b = bancoFalso({ kanban_status_config: [] });
  await assert.rejects(primeiraColunaMedicos(b.db), /sem colunas/);
});

test("corpo clínico (sem Kanban): só cria o médico", async () => {
  const b = bancoFalso({ leads: [{ id: "lead-x", status: "Convertido" }] });
  await criarMedicoDoLeadNovo(b.db, { leadId: "lead-x", medico: MEDICO, crm: "SC 2" });
  assert.equal(b.tabelas.medicos.length, 1);
  assert.equal(b.tabelas.medico_kanban_cards, undefined);
  assert.ok(!b.chamadas.some((c) => c.tabela === "leads"), "não mexe no lead");
});
