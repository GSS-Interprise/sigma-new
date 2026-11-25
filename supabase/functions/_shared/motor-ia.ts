// Motor de IA do Sigma (docs/arquitetura/motor-ia-hermes-claude.md): o Claude da GSS roda no Hermes da VPS e é pedido
// pela fila rotina_pedidos (rotinas ia_claude_*). Quem usa: campanha-assistente-ia e sigma-assistente. Sem login, com
// erro ou demora, cada edge cai no Gemini; por isso aqui nada lança erro para fora: null = "use a reserva".
// Testes: motor-ia_test.ts.

// deno-lint-ignore no-explicit-any
type Svc = any;

/** Rotinas da VPS que respondem a um processo do Sigma (a tela Motor de IA lista as mesmas). */
export const PROCESSOS_CLAUDE = ["ia_claude_assistente_campanha", "ia_claude_robo_sigma", "ia_claude_sugerir_resposta"] as const;

type PedidoConcluido = { tipo: string; status: string; resultado?: Record<string, unknown> | null; erro?: string | null };

/**
 * Decide pelo último pedido do motor que terminou (o primeiro da lista, do mais novo para o mais velho): login, teste,
 * desconexão ou um dos processos. Sem pedido nenhum (o caso até a GSS conectar) = desligado.
 */
export function ligadoPelosPedidos(pedidos: PedidoConcluido[], processos: readonly string[]): boolean {
  for (const p of pedidos) {
    if (p.tipo === "ia_claude_sair" && p.status === "feito") return false;
    if (p.tipo === "ia_claude_codigo" && p.status === "feito") return true;
    if (p.tipo === "ia_claude_situacao" && p.status === "feito") return !!p.resultado?.conectado;
    if (p.tipo === "ia_claude_teste" && p.status === "feito") return !!p.resultado?.ok;
    if (processos.includes(p.tipo)) return !String(p.erro || "").includes("sem-login");
  }
  return false;
}

/**
 * O Claude está ligado? `processos` = as rotinas de processo cujo erro "sem-login" também conta como desligado.
 * A edge vai direto ao Gemini quando não há login, sem esperar a VPS.
 */
export async function claudeLigado(svc: Svc, processos: readonly string[] = PROCESSOS_CLAUDE): Promise<boolean> {
  const { data } = await svc.from("rotina_pedidos").select("tipo, status, resultado, erro")
    .in("tipo", ["ia_claude_situacao", "ia_claude_codigo", "ia_claude_teste", "ia_claude_sair", ...processos])
    .in("status", ["feito", "erro"]).order("concluido_em", { ascending: false }).limit(10);
  return ligadoPelosPedidos((data || []) as PedidoConcluido[], processos);
}

export type OpcoesPedido = {
  /** Tempo total de espera pelo resultado. */
  limiteMs: number;
  /** Se a VPS não pegou o pedido neste tempo, desiste já (worker parado). Sem valor = espera até o limite. */
  pegarMs?: number;
  /** Intervalo entre consultas à fila. */
  passoMs?: number;
  /** Depois de ler, apaga o resultado da fila (resposta com dado que não precisa ficar guardado). */
  limparResultado?: boolean;
};

export const ERRO_DESISTIU = "a edge desistiu de esperar";

/**
 * Pede uma rotina ia_claude_* ao worker da VPS (laço rápido: 8 s parado, 2 s depois de um pedido) e espera o resultado.
 * Devolve o `resultado` do pedido feito, ou null (erro, sem login, demora): quem chama cai no Gemini.
 */
export async function pedirAoClaude(svc: Svc, tipo: string, payload: unknown, o: OpcoesPedido): Promise<Record<string, unknown> | null> {
  const { data: id, error } = await svc.rpc("rotina_pedir", { p_tipo: tipo, p_payload: payload });
  if (error || !id) return null;
  const inicio = Date.now();
  while (Date.now() - inicio < o.limiteMs) {
    await new Promise((r) => setTimeout(r, o.passoMs ?? 1500));
    const { data: p } = await svc.from("rotina_pedidos").select("status, resultado").eq("id", id).single();
    if (p?.status === "feito") {
      if (o.limparResultado) await svc.from("rotina_pedidos").update({ resultado: {} }).eq("id", id);
      return (p.resultado ?? null) as Record<string, unknown> | null;
    }
    if (p?.status === "erro") return null;
    if (o.pegarMs && p?.status === "pendente" && Date.now() - inicio > o.pegarMs) break;
  }
  // Desistiu: se a VPS ainda não pegou, tira da fila para não gastar a cota com resposta que ninguém vai ler.
  // Com limparResultado o payload (que leva dado) também sai: rotina_concluir não roda num pedido que ninguém pegou.
  const fechar: Record<string, unknown> = { status: "erro", erro: ERRO_DESISTIU, concluido_em: new Date().toISOString() };
  if (o.limparResultado) fechar.payload = {};
  await svc.from("rotina_pedidos").update(fechar).eq("id", id).eq("status", "pendente");
  return null;
}
