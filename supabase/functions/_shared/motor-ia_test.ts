import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ERRO_DESISTIU, ligadoPelosPedidos, pedirAoClaude, PROCESSOS_CLAUDE } from "./motor-ia.ts";

const campanha = ["ia_claude_assistente_campanha"];

Deno.test("ligado: sem pedido nenhum = desligado (o caso até a GSS conectar)", () => {
  assertEquals(ligadoPelosPedidos([], PROCESSOS_CLAUDE), false);
});

Deno.test("ligado: vale o pedido mais novo que decide", () => {
  assert(ligadoPelosPedidos([{ tipo: "ia_claude_codigo", status: "feito" }], campanha));
  assertEquals(ligadoPelosPedidos([{ tipo: "ia_claude_sair", status: "feito" }, { tipo: "ia_claude_codigo", status: "feito" }], campanha), false);
  assert(ligadoPelosPedidos([{ tipo: "ia_claude_situacao", status: "feito", resultado: { conectado: true } }], campanha));
  assertEquals(ligadoPelosPedidos([{ tipo: "ia_claude_teste", status: "feito", resultado: { ok: false } }], campanha), false);
  // Teste com erro de rede não decide: passa para o próximo.
  assert(ligadoPelosPedidos([{ tipo: "ia_claude_teste", status: "erro" }, { tipo: "ia_claude_codigo", status: "feito" }], campanha));
});

Deno.test("ligado: erro sem-login de um processo desliga; outro erro não", () => {
  assertEquals(ligadoPelosPedidos([{ tipo: "ia_claude_robo_sigma", status: "erro", erro: "RuntimeError: sem-login" }], PROCESSOS_CLAUDE), false);
  assert(ligadoPelosPedidos([{ tipo: "ia_claude_robo_sigma", status: "erro", erro: ERRO_DESISTIU }], PROCESSOS_CLAUDE));
  // A campanha passa só a própria rotina, como antes da extração: o pedido do robô não decide por ela.
  assert(ligadoPelosPedidos([
    { tipo: "ia_claude_robo_sigma", status: "erro", erro: "sem-login" }, { tipo: "ia_claude_codigo", status: "feito" },
  ], campanha));
});

// Fila falsa: guarda o pedido e responde conforme `roteiro` a cada consulta.
function filaFalsa(roteiro: { status: string; resultado?: unknown }[]) {
  const updates: Record<string, unknown>[] = [];
  let i = 0;
  const svc = {
    rpc: (_f: string, _a: unknown) => Promise.resolve({ data: "id-1", error: null }),
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: roteiro[Math.min(i++, roteiro.length - 1)] }) }) }),
      update: (v: Record<string, unknown>) => { updates.push(v); const q = { eq: () => q, then: (r: (x: unknown) => void) => r({}) }; return q; },
    }),
  };
  return { svc, updates };
}

Deno.test("pedir: devolve o resultado e limpa a fila quando pedido", async () => {
  const { svc, updates } = filaFalsa([{ status: "executando" }, { status: "feito", resultado: { passo: { resposta: "oi" } } }]);
  const r = await pedirAoClaude(svc, "ia_claude_robo_sigma", {}, { limiteMs: 1000, passoMs: 1, limparResultado: true });
  assertEquals(r, { passo: { resposta: "oi" } });
  assertEquals(updates, [{ resultado: {} }]);
});

Deno.test("pedir: erro da VPS = null (cai no Gemini)", async () => {
  const { svc } = filaFalsa([{ status: "erro" }]);
  assertEquals(await pedirAoClaude(svc, "x", {}, { limiteMs: 1000, passoMs: 1 }), null);
});

Deno.test("pedir: VPS que não pega o pedido desiste antes do teto e tira o dado da fila", async () => {
  const { svc, updates } = filaFalsa([{ status: "pendente" }]);
  const t = Date.now();
  assertEquals(await pedirAoClaude(svc, "x", {}, { limiteMs: 5000, pegarMs: 30, passoMs: 5, limparResultado: true }), null);
  assert(Date.now() - t < 2000);
  assertEquals(updates.length, 1);
  assertEquals(updates[0].erro, ERRO_DESISTIU);
  assertEquals(updates[0].payload, {});
});

Deno.test("pedir: sem limparResultado o fechamento é o de antes (só status, erro e hora)", async () => {
  const { svc, updates } = filaFalsa([{ status: "pendente" }]);
  await pedirAoClaude(svc, "x", {}, { limiteMs: 30, passoMs: 5 });
  assertEquals(Object.keys(updates[0]).sort(), ["concluido_em", "erro", "status"]);
});
