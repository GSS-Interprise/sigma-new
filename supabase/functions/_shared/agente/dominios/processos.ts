// Domínio "processos" do protocolo do agente (assistente do Sigma, fase 4, 22/11/2026): responde "como faço X no
// Sigma" pelo manual curto (docs/manual-sigma/*.md, embutido em ../manual/paginas.gen.ts). Sem página que responda,
// a resposta é "não está no manual" — a IA não inventa processo.
// Cada página tem o módulo da tela; a pessoa só recebe páginas de módulos que ela vê (pode_modulo, que já desconta o
// bloqueio por pessoa). Página com modulo "todos" vale para qualquer um.
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import { ErroFerramenta } from "../tipos.ts";
import { semAcento } from "../tempo.ts";
import { buscar, type Pagina } from "../manual/manual.ts";
import { PAGINAS } from "../manual/paginas.gen.ts";

export const MANUAL_ATUALIZADO = "2026-11-22";
const fonte = (): Fonte => ({ nome: "Manual do Sigma (docs/manual-sigma)", atualizado_em: `${MANUAL_ATUALIZADO}T12:00:00Z` });

/** Páginas que a pessoa pode ler: módulo "todos" ou módulo que ela vê na tela. */
export async function paginasDe(ctx: Ctx, paginas: Pagina[] = PAGINAS): Promise<Pagina[]> {
  const mods = [...new Set(paginas.map((p) => p.modulo).filter((m) => m !== "todos"))];
  const vistos = await Promise.all(mods.map(async (m) => {
    const { data } = await ctx.svc.rpc("pode_modulo", { p_uid: ctx.userId, p_modulo: m, p_acao: "visualizar" });
    return [m, !!data] as const;
  }));
  const ok = new Map(vistos);
  return paginas.filter((p) => p.modulo === "todos" || ok.get(p.modulo));
}

const primeiraLinha = (p: Pagina) => p.texto.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "";

async function areas(ctx: Ctx): Promise<Resultado> {
  const ps = await paginasDe(ctx);
  return {
    resumo: `**Manual do Sigma**: ${ps.length} áreas que você pode consultar.`,
    corpo: "\n" + ps.map((p) => `- **${p.titulo}** (\`${p.area}\`): ${primeiraLinha(p)}`).join("\n"),
    dados: { areas: ps.map((p) => p.area) },
    totais: { areas: ps.length },
    fonte: fonte(),
  };
}

async function manual(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const q = semAcento(String(a.area ?? ""));
  if (!q) throw new ErroFerramenta("informe a área (veja processos_areas)");
  const todas = PAGINAS.filter((p) => semAcento(p.area) === q || semAcento(p.titulo) === q);
  if (!todas.length) throw new ErroFerramenta(`área desconhecida: ${a.area}. Use processos_areas para ver as áreas.`);
  const ps = await paginasDe(ctx, todas);
  if (!ps.length) return { resumo: `Você não tem acesso à área ${todas[0].titulo} no Sigma, então o manual dela não está disponível para você.`, dados: { area: todas[0].area, acesso: false }, fonte: fonte() };
  const p = ps[0];
  return { resumo: `# Manual: ${p.titulo}`, corpo: "\n" + p.texto.replace(/^# .*\n?/, ""), dados: { area: p.area, telas: p.telas }, fonte: fonte() };
}

async function busca(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const pergunta = String(a.pergunta ?? "").trim();
  if (pergunta.length < 4) throw new ErroFerramenta("escreva a dúvida com algumas palavras (ex.: como criar campanha)");
  const ps = await paginasDe(ctx);
  const achadas = buscar(ps, pergunta);
  if (!achadas.length) {
    return {
      resumo: `O manual do Sigma não tem nada sobre "${pergunta}" nas áreas que você vê. Diga que não sabe e sugira procurar quem cuida da área; não invente o processo.`,
      dados: { pergunta, secoes: [] }, totais: { secoes: 0 }, fonte: fonte(),
    };
  }
  return {
    resumo: `**${achadas.length} trechos do manual** para "${pergunta}". Responda só com o que está aqui.`,
    corpo: "\n" + achadas.map((s) => `### ${s.titulo} › ${s.secao}\n${s.texto}`).join("\n\n"),
    dados: { pergunta, secoes: achadas.map((s) => [s.area, s.secao]) },
    totais: { secoes: achadas.length },
    fonte: fonte(),
  };
}

export const processos: Dominio = {
  id: "processos",
  titulo: "Processos e manual do Sigma",
  versao: "1.0.0",
  status: "ativo",
  resumo: "como usar o Sigma: passo a passo de cada área (campanhas, licitações, contratos, médicos, escalas, financeiro...) pelo manual.",
  frescor: async () => fonte(),
  guia: {
    proposito: "Responde dúvidas de COMO fazer as coisas no Sigma (onde fica, passo a passo, regras, quem pode) pelo manual curto, escrito a partir do sistema. Para números da operação, use os outros domínios.",
    glossario: [
      { termo: "Área", definicao: "uma página do manual, igual a um módulo/tela do Sigma (ex.: prospeccao, licitacoes, contratos)." },
      { termo: "Trecho", definicao: "uma seção de uma página (\"Como fazer: ...\", \"Regras e situações\", \"Perguntas frequentes\")." },
    ],
    rotas: [
      { pergunta: "Como faço X no Sigma / onde fica Y / por que não consigo Z", ferramenta: "processos_buscar" },
      { pergunta: "Me explica a área X inteira", ferramenta: "processos_manual" },
      { pergunta: "O que o manual cobre", ferramenta: "processos_areas" },
    ],
    regras: [
      "Responda só com o que os trechos dizem, com os nomes de botão exatamente como estão.",
      "Se a busca não achar nada, diga que não está no manual e sugira procurar quem cuida da área. Nunca invente passo, botão ou regra.",
      "Se a dúvida for de número (quantos, quais), use o domínio do assunto, não o manual.",
    ],
    limites: [
      "Só cobre as áreas que têm página no manual; telas sem página ficam sem resposta.",
      "O manual descreve o sistema na data de atualização; tela mudada depois pode estar diferente.",
      "Não executa nada: só explica.",
    ],
  },
  ferramentas: [
    {
      nome: "processos_buscar",
      titulo: "Buscar no manual",
      descricao: "Acha no manual do Sigma os trechos que respondem a uma dúvida de uso (como fazer, onde fica, regras, quem pode). Use para qualquer pergunta de processo.",
      inputSchema: { type: "object", properties: { pergunta: { type: "string", description: "A dúvida, com as palavras da pessoa" } }, required: ["pergunta"] },
      executar: busca,
    },
    {
      nome: "processos_manual",
      titulo: "Página do manual",
      descricao: "A página inteira do manual de uma área do Sigma.",
      inputSchema: { type: "object", properties: { area: { type: "string", description: "Id da área (veja processos_areas), ex.: prospeccao, licitacoes" } }, required: ["area"] },
      executar: manual,
    },
    {
      nome: "processos_areas",
      titulo: "Áreas do manual",
      descricao: "Lista as áreas do manual do Sigma que a pessoa pode consultar.",
      inputSchema: { type: "object", properties: {} },
      executar: (ctx) => areas(ctx),
    },
  ],
  prompts: [
    {
      nome: "processos_como_faco",
      titulo: "Como faço no Sigma",
      descricao: "Passo a passo de uma tarefa no Sigma, pelo manual.",
      argumentos: [{ name: "duvida", description: "O que você quer fazer", required: true }],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=processos, depois processos_buscar com pergunta=${a.duvida}. Responda só com o que o manual diz; se não achar, diga que não está no manual.`,
    },
  ],
};
