// Caminho do Claude da GSS no robô do Sigma (docs/arquitetura/motor-ia-hermes-claude.md, 25/11/2026).
// Desenho (b): a edge continua dona do laço de ferramentas e o Claude (Hermes na VPS, rotina ia_claude_robo_sigma) só
// decide o PRÓXIMO PASSO em JSON: pedir ferramentas ou responder. Assim as ferramentas rodam aqui, com as mesmas
// permissões da pessoa (roboLiberado, MODULO_DO_DOMINIO, campanha da página) e as propostas "Confere?" de sempre.
// O desenho (a), Claude na VPS chamando o sigma-mcp, foi descartado: o MCP decide acesso por papel
// (agente_dominio_acessos), não pelo módulo da tela de cada pessoa, e exigiria um token por usuário na VPS.
// Funções puras (sem banco e sem rede). Testes: claude_test.ts.

export type FerramentaClaude = { nome: string; descricao: string; esquema: unknown };
export type Chamada = { nome: string; args: Record<string, unknown> };
export type Passo = { tipo: "resposta"; texto: string } | { tipo: "ferramentas"; chamadas: Chamada[] };
/** Uma troca da pergunta atual: o que o Claude pediu e o que cada ferramenta devolveu. */
export type Rodada = { chamadas: Chamada[]; resultados: string[] };

export const MAX_CHAMADAS_POR_PASSO = 4;
// Cada resultado de ferramenta entra cortado: o pedido inteiro vai pela fila e vira UM argumento da linha de comando do
// Hermes na VPS, e o Linux recusa argumento acima de 128 KB. As instruções já somam ~27 KB (guias dos domínios), então
// os resultados dividem entre si ~60 mil caracteres, até 8 mil cada.
const MAX_RESULTADO = 8_000;
const MAX_RESULTADOS_JUNTOS = 60_000;
const MAX_MSG_HISTORICO = 2_000;

/** Regras do passo em JSON, somadas às instruções de sempre (as mesmas que o Gemini recebe). */
export function instrucoesClaude(sistema: string, ferramentas: FerramentaClaude[], podeFerramenta: boolean): string {
  const lista = ferramentas.map((f) => ({ nome: f.nome, descricao: f.descricao, parametros: f.esquema }));
  return [
    sistema,
    "",
    "## Como você trabalha aqui",
    "Você não chama ferramentas diretamente. A cada passo, devolva SÓ um JSON, sem texto antes ou depois, num destes formatos:",
    `- {"ferramentas": [{"nome": "<nome>", "args": { ... }}]} para consultar dados ou montar uma proposta (até ${MAX_CHAMADAS_POR_PASSO} por passo). O resultado volta no próximo passo.`,
    '- {"resposta": "<texto final para a pessoa>"} quando já tiver o que precisa. Markdown simples é aceito.',
    podeFerramenta
      ? "Ferramentas disponíveis (nome, descrição e parâmetros em JSON Schema). Use só estas, com os nomes exatos:"
      : 'Neste passo não há mais ferramentas: responda agora com {"resposta": ...} usando o que já foi consultado.',
    podeFerramenta ? JSON.stringify(lista) : "",
  ].filter((l) => l !== "").join("\n");
}

/** A conversa e os passos já dados nesta pergunta, em texto, para o Claude decidir o próximo passo. */
export function pedidoClaude(anteriores: { papel: string; texto: string }[], mensagem: string, rodadas: Rodada[]): string {
  const linhas: string[] = [];
  if (anteriores.length) {
    linhas.push("## Conversa até aqui");
    for (const m of anteriores) linhas.push(`${m.papel === "usuario" ? "Pessoa" : "Assistente"}: ${m.texto.slice(0, MAX_MSG_HISTORICO)}`);
    linhas.push("");
  }
  linhas.push("## Pergunta atual", `Pessoa: ${mensagem}`);
  const total = rodadas.reduce((n, r) => n + r.chamadas.length, 0);
  const corte = Math.min(MAX_RESULTADO, Math.floor(MAX_RESULTADOS_JUNTOS / Math.max(1, total)));
  rodadas.forEach((r, i) => {
    linhas.push("", `## Passo ${i + 1}: ferramentas consultadas`);
    r.chamadas.forEach((c, j) => {
      const saida = r.resultados[j] ?? "";
      linhas.push(`### ${c.nome} ${JSON.stringify(c.args)}`, saida.length > corte ? `${saida.slice(0, corte)}\n[resultado cortado]` : saida);
    });
  });
  linhas.push("", "Devolva agora o JSON do próximo passo.");
  return linhas.join("\n");
}

/** Lê o JSON do Claude. null = formato inesperado (a edge cai no Gemini). */
export function lerPasso(obj: unknown): Passo | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (Array.isArray(o.ferramentas) && o.ferramentas.length) {
    const chamadas: Chamada[] = [];
    for (const c of o.ferramentas.slice(0, MAX_CHAMADAS_POR_PASSO)) {
      if (!c || typeof c !== "object") return null;
      const x = c as Record<string, unknown>;
      if (typeof x.nome !== "string" || !x.nome.trim()) return null;
      const args = x.args && typeof x.args === "object" && !Array.isArray(x.args) ? x.args as Record<string, unknown> : {};
      chamadas.push({ nome: x.nome.trim(), args });
    }
    return { tipo: "ferramentas", chamadas };
  }
  if (typeof o.resposta === "string" && o.resposta.trim()) return { tipo: "resposta", texto: o.resposta.trim() };
  return null;
}
