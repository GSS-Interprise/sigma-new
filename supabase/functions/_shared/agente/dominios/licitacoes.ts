// Domínio "licitacoes" do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3i; assistente do Sigma,
// fase 2, 21/11/2026). Mesmos filtros do Kanban de Licitações (LicitacoesKanban.tsx): quadro de produção (board
// 'effecti'), GSS por padrão, sem arquivados. Consultas em supabase/migrations/20261121230000_agente_licitacoes.sql.
// Definições:
//   - card ativo = no quadro, não arquivado (o Sigma arquiva 30 dias depois da última data, no descarte e no "não ganhamos");
//   - nova = card que entrou no quadro no período (created_at), vindo da captação (Effecti);
//   - disputa = data e hora da sessão (data_disputa); "já trabalhada" = saiu da Captação de edital.
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import { ErroFerramenta } from "../tipos.ts";
import { diaBR, momentoBR, semAcento } from "../tempo.ts";

const FONTE = "Sigma (Kanban de Licitações)";
const MAX_LISTA = 25;
const EMPRESAS: Record<string, string | null> = { gss: "GSS", ages: "AGES", todas: null };
const CAPTACAO = "Captação de edital";

type Linha = {
  id: string; titulo: string | null; orgao: string | null; municipio_uf: string | null; valor_estimado: number | null;
  data_disputa: string | null; coluna: string; empresa: string | null; responsavel?: string | null; criado_em?: string;
};

function empresaDe(v: unknown): { chave: string; valor: string | null } {
  const k = semAcento(String(v ?? "gss")) || "gss";
  if (!(k in EMPRESAS)) throw new ErroFerramenta(`empresa inválida: ${v}. Use GSS, AGES ou todas.`);
  return { chave: k, valor: EMPRESAS[k] };
}
const rotuloEmpresa = (e: { chave: string }) => (e.chave === "todas" ? "GSS e AGES" : e.chave.toUpperCase());

/** Frescor: hora da última licitação que entrou no quadro (a captação da Effecti roda pelo n8n). */
async function frescor(ctx: Ctx): Promise<Fonte> {
  const { data } = await ctx.svc.from("licitacoes").select("created_at").eq("board", "effecti")
    .order("created_at", { ascending: false }).order("id").limit(1).maybeSingle();
  return { nome: `${FONTE}, última licitação captada`, atualizado_em: data?.created_at ?? null };
}
const aoVivo = (ctx: Ctx): Fonte => ({ nome: `${FONTE}, ao vivo`, atualizado_em: ctx.agora.toISOString() });

export const reais = (v: number | null | undefined) =>
  v == null || !Number(v) ? "valor não informado" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).replace(/\s/g, " ");

/** Uma linha de licitação, sempre no mesmo formato (o hash depende do dado, o texto depende disto). */
export function linhaLicitacao(l: Linha, mostrarColuna = true): string {
  const quando = l.data_disputa ? `disputa ${momentoBR(new Date(l.data_disputa))}` : "sem data de disputa";
  const partes = [quando, l.orgao?.trim(), l.municipio_uf?.trim(), reais(l.valor_estimado)];
  if (mostrarColuna) partes.push(l.coluna);
  if (l.responsavel) partes.push(`responsável ${l.responsavel.trim()}`);
  return `- **${(l.titulo || "Sem título").replace(/\s+/g, " ").trim().slice(0, 140)}**: ${partes.filter(Boolean).join(" · ")}`;
}

async function quadro(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const emp = empresaDe(a.empresa);
  const { data, error } = await ctx.svc.rpc("agente_licitacoes_quadro", { p_empresa: emp.valor });
  if (error) throw error;
  const cols = (data || []) as { status: string; coluna: string; ordem: number; cards: number }[];
  const total = cols.reduce((s, c) => s + Number(c.cards), 0);
  const captacao = Number(cols.find((c) => c.status === "captacao_edital")?.cards ?? 0);
  return {
    resumo: `**Quadro de Licitações (${rotuloEmpresa(emp)})**: ${total} cards ativos, ${captacao} ainda na Captação de edital e ${total - captacao} já em trabalho.`,
    corpo: "\n" + cols.map((c) => `- ${c.coluna}: ${c.cards}`).join("\n"),
    dados: { empresa: emp.chave, colunas: cols.map((c) => [c.status, Number(c.cards)]) },
    totais: { cards: total, captacao, em_trabalho: total - captacao },
    fonte: aoVivo(ctx),
  };
}

async function novas(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const emp = empresaDe(a.empresa);
  const dias = Math.round(Number(a.dias ?? 1));
  if (!Number.isFinite(dias) || dias < 1 || dias > 30) throw new ErroFerramenta("dias deve ser de 1 a 30");
  const desde = new Date(ctx.agora.getTime() - dias * 86_400_000);
  const { data, error } = await ctx.svc.rpc("agente_licitacoes_novas", { p_desde: desde.toISOString(), p_empresa: emp.valor });
  if (error) throw error;
  const ls = (data || []) as Linha[];
  const periodo = dias === 1 ? "nas últimas 24 h" : `nos últimos ${dias} dias`;
  const fonte = await frescor(ctx);
  if (!ls.length) return { resumo: `Nenhuma licitação nova ${periodo} no quadro (${rotuloEmpresa(emp)}).`, dados: { empresa: emp.chave, dias, ids: [] }, totais: { novas: 0 }, fonte };
  const mostradas = ls.slice(0, MAX_LISTA);
  return {
    resumo: `**${ls.length} licitações novas ${periodo}** no quadro (${rotuloEmpresa(emp)}).`,
    corpo: "\n" + mostradas.map((l) => linhaLicitacao(l)).join("\n"),
    dados: { empresa: emp.chave, dias, ids: ls.map((l) => l.id) },
    totais: { novas: ls.length },
    cortado: ls.length > MAX_LISTA ? { mostrados: MAX_LISTA, dica: "peça menos dias ou abra o quadro de Licitações" } : undefined,
    fonte,
  };
}

async function disputas(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const emp = empresaDe(a.empresa);
  const dias = Math.round(Number(a.dias ?? 7));
  if (!Number.isFinite(dias) || dias < 1 || dias > 60) throw new ErroFerramenta("dias deve ser de 1 a 60");
  const ate = new Date(ctx.agora.getTime() + dias * 86_400_000);
  const { data, error } = await ctx.svc.rpc("agente_licitacoes_disputas", { p_de: ctx.agora.toISOString(), p_ate: ate.toISOString(), p_empresa: emp.valor });
  if (error) throw error;
  const ls = (data || []) as Linha[];
  const trabalhadas = ls.filter((l) => l.coluna !== CAPTACAO);
  const captadas = ls.length - trabalhadas.length;
  const periodo = dias === 1 ? "nas próximas 24 h" : `nos próximos ${dias} dias`;
  const fonte = aoVivo(ctx);
  if (!ls.length) return { resumo: `Nenhuma disputa ${periodo} no quadro (${rotuloEmpresa(emp)}).`, dados: { empresa: emp.chave, dias, ids: [] }, totais: { disputas: 0, trabalhadas: 0, so_captadas: 0 }, fonte };
  // Primeiro as que a equipe já trabalha (são as que pedem ação); depois as só captadas, por data.
  const ordem = [...trabalhadas, ...ls.filter((l) => l.coluna === CAPTACAO)];
  const mostradas = ordem.slice(0, MAX_LISTA);
  return {
    resumo: `**${ls.length} disputas ${periodo}** (${rotuloEmpresa(emp)}): ${trabalhadas.length} já em trabalho e ${captadas} ainda na Captação de edital (ninguém analisou).`,
    corpo: "\n" + mostradas.map((l) => linhaLicitacao(l)).join("\n"),
    dados: { empresa: emp.chave, dias, ids: ordem.map((l) => l.id) },
    totais: { disputas: ls.length, trabalhadas: trabalhadas.length, so_captadas: captadas },
    cortado: ls.length > MAX_LISTA ? { mostrados: MAX_LISTA, dica: "peça menos dias; o quadro de Licitações tem a lista completa" } : undefined,
    fonte,
  };
}

/** Busca do jeito que a pessoa fala: número do edital, código, órgão ou trecho do título. */
export function acharLicitacoes<T extends { titulo: string | null; numero_edital: string | null; licitacao_codigo: string | null; orgao: string | null }>(lista: T[], busca: string): T[] {
  const q = semAcento(busca);
  if (!q) return [];
  const campo = (l: T) => [l.numero_edital, l.licitacao_codigo].map((x) => semAcento(x || ""));
  const exato = lista.filter((l) => campo(l).includes(q));
  if (exato.length) return exato;
  const palavras = q.split(/\s+/).filter(Boolean);
  return lista.filter((l) => {
    const texto = semAcento([l.titulo, l.numero_edital, l.licitacao_codigo, l.orgao].filter(Boolean).join(" "));
    return palavras.every((p) => texto.includes(p));
  });
}

const textoDoHtml = (h: string | null) => String(h || "").replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function edital(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const busca = String(a.busca ?? "").trim();
  if (busca.length < 3) throw new ErroFerramenta("informe o número do edital, o órgão ou parte do título (3 letras ou mais)");
  const termo = busca.replace(/[%,()]/g, " ").trim();
  const { data, error } = await ctx.svc.from("licitacoes")
    .select("id, titulo, numero_edital, licitacao_codigo, orgao, municipio_uf, valor_estimado, data_disputa, status, empresa, etiquetas, deliberacao, arquivado_em, responsavel_id, created_at")
    .eq("board", "effecti")
    .or(`titulo.ilike.%${termo}%,numero_edital.ilike.%${termo}%,orgao.ilike.%${termo}%,licitacao_codigo.ilike.%${termo}%`)
    .order("arquivado_em", { ascending: false, nullsFirst: true }).order("data_disputa", { ascending: false }).order("id").limit(50);
  if (error) throw error;
  type L = { id: string; titulo: string | null; numero_edital: string | null; licitacao_codigo: string | null; orgao: string | null; municipio_uf: string | null;
    valor_estimado: number | null; data_disputa: string | null; status: string; empresa: string | null; etiquetas: string[] | null; deliberacao: string | null;
    arquivado_em: string | null; responsavel_id: string | null; created_at: string };
  let achadas = acharLicitacoes((data || []) as L[], busca);
  if (!achadas.length) achadas = (data || []) as L[];
  const ativas = achadas.filter((l) => !l.arquivado_em);
  if (ativas.length === 1) achadas = ativas;
  if (achadas.length !== 1) {
    const texto = achadas.length === 0
      ? `Nenhuma licitação do quadro casa com "${busca}".`
      : `"${busca}" casa com ${achadas.length} licitações. Pergunte qual: ${achadas.slice(0, 8).map((l) => `${(l.titulo || "").trim().slice(0, 70)} (${l.numero_edital || "sem número"}, ${l.orgao || "órgão?"}${l.arquivado_em ? ", arquivada" : ""})`).join("; ")}`;
    return { resumo: texto, dados: { aviso: texto }, fonte: aoVivo(ctx) };
  }
  const l = achadas[0];
  const [{ data: col }, { data: resp }, { data: an }, { data: tarefas }] = await Promise.all([
    ctx.svc.from("licitacoes_colunas").select("nome").eq("status_vinculado", l.status).maybeSingle(),
    l.responsavel_id ? ctx.svc.from("profiles").select("nome_completo").eq("id", l.responsavel_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.svc.from("licitacao_analises").select("status, html, html_editado, concluido_em").eq("licitacao_id", l.id)
      .order("criado_em", { ascending: false }).order("id").limit(1).maybeSingle(),
    ctx.svc.from("licitacao_tarefas").select("titulo, data_hora").eq("licitacao_id", l.id).is("concluida_em", null)
      .order("data_hora").order("id").limit(10),
  ]);
  const coluna = col?.nome ?? l.status;
  const analise = an && an.status === "pronta" ? textoDoHtml(an.html_editado || an.html).slice(0, 900) : null;
  const ts = (tarefas || []) as { titulo: string; data_hora: string | null }[];
  const partes = [
    `\n- Coluna: ${coluna}${l.arquivado_em ? ` (arquivada em ${diaBR(l.arquivado_em.slice(0, 10))})` : ""}`,
    `- Edital: ${l.numero_edital || "sem número"} · ${l.orgao || "órgão não informado"} · ${l.municipio_uf || "local não informado"}`,
    `- Disputa: ${l.data_disputa ? momentoBR(new Date(l.data_disputa)) : "sem data"} · valor estimado ${reais(l.valor_estimado)}`,
    `- Responsável: ${resp?.nome_completo?.trim() || "ninguém"} · empresa ${l.empresa || "?"}${l.etiquetas?.length ? ` · etiquetas ${l.etiquetas.join(", ")}` : ""}`,
  ];
  if (l.deliberacao?.trim()) partes.push(`- Deliberação: ${l.deliberacao.trim().slice(0, 400)}`);
  partes.push(ts.length ? `\n### Tarefas abertas\n${ts.map((t) => `- ${t.titulo}${t.data_hora ? ` (${momentoBR(new Date(t.data_hora))})` : ""}`).join("\n")}` : "\nSem tarefa aberta.");
  partes.push(analise ? `\n### Análise do edital (IA, revisada pela equipe quando editada)\n${analise}` : `\nAnálise do edital: ${an ? `situação "${an.status}"` : "não foi feita"}.`);
  return {
    resumo: `**${(l.titulo || "Sem título").replace(/\s+/g, " ").trim().slice(0, 160)}**: ${coluna}, disputa ${l.data_disputa ? momentoBR(new Date(l.data_disputa)) : "sem data"}.`,
    corpo: partes.join("\n"),
    dados: { id: l.id, status: l.status, data_disputa: l.data_disputa, arquivado: !!l.arquivado_em, tarefas: ts.length, analise: !!analise },
    totais: { tarefas_abertas: ts.length },
    fonte: aoVivo(ctx),
  };
}

const ESQ_EMPRESA = { type: "string", enum: ["GSS", "AGES", "todas"], description: "Padrão: GSS (o quadro da GSS)" };

export const licitacoes: Dominio = {
  id: "licitacoes",
  titulo: "Licitações",
  versao: "1.0.0",
  status: "ativo",
  resumo: "licitações do quadro: situação por coluna, novas que chegaram, disputas próximas e a situação de um edital.",
  frescor,
  guia: {
    proposito: "Responde sobre o quadro de Licitações do Sigma (Kanban da GSS, alimentado pela captação da Effecti). Os números são os mesmos do quadro, ao vivo, com os mesmos filtros: GSS por padrão e sem os cards arquivados.",
    glossario: [
      { termo: "Quadro", definicao: "o Kanban de Licitações do Sigma, da GSS por padrão. AGES só se pedirem (empresa=AGES ou todas)." },
      { termo: "Card ativo", definicao: "licitação no quadro que não foi arquivada. O Sigma arquiva 30 dias depois da última data, no descarte e no \"não ganhamos\"." },
      { termo: "Captação de edital", definicao: "primeira coluna: o edital chegou da captação e ninguém analisou ainda." },
      { termo: "Em trabalho", definicao: "card que já saiu da Captação de edital (análise, proposta, disputa, deliberação...)." },
      { termo: "Nova", definicao: "licitação que entrou no quadro no período, pela captação." },
      { termo: "Disputa", definicao: "data e hora da sessão do edital. Disputas próximas não incluem cards descartados, perdidos, suspensos, arrematados ou já homologados." },
      { termo: "Análise do edital", definicao: "resumo do edital feito pela IA e revisado pela equipe no card." },
    ],
    rotas: [
      { pergunta: "Como está o quadro / quantas licitações em cada coluna", ferramenta: "licitacoes_quadro" },
      { pergunta: "Chegou licitação nova? / o que entrou hoje ou na semana", ferramenta: "licitacoes_novas", observacao: "dias: 1 = últimas 24 h" },
      { pergunta: "Quais disputas temos esta semana / nos próximos dias", ferramenta: "licitacoes_disputas", observacao: "dias: padrão 7" },
      { pergunta: "Como está o edital X / o pregão do órgão Y", ferramenta: "licitacoes_edital" },
    ],
    regras: [
      "Diga sempre de qual quadro é o número (GSS, AGES ou os dois).",
      "Em disputas, separe as já em trabalho das que ainda estão na Captação de edital: as primeiras pedem ação da equipe.",
      "Valor estimado é o do edital; não some valores nem estime chance de ganhar.",
      "Edital pedido por parte do nome ou número; se a ferramenta disser que casa com vários, pergunte qual.",
    ],
    limites: [
      "Não tem o quadro do robô do PNCP (comparativo) nem os editais que só a Effecti viu e não entraram no quadro.",
      "Não tem o histórico de mudança de coluna (quando cada card mudou de etapa) nem taxa de vitória.",
      "Não move card, não cria tarefa e não muda nada: só leitura.",
    ],
  },
  ferramentas: [
    {
      nome: "licitacoes_quadro",
      titulo: "Quadro de Licitações",
      descricao: "Quantos cards ativos há em cada coluna do quadro de Licitações (Captação de edital, Análise, Proposta, Disputa, Deliberação...).",
      inputSchema: { type: "object", properties: { empresa: ESQ_EMPRESA } },
      executar: quadro,
    },
    {
      nome: "licitacoes_novas",
      titulo: "Licitações novas",
      descricao: "Licitações que entraram no quadro nos últimos N dias, com órgão, local, valor, data da disputa e coluna. Padrão: últimas 24 h.",
      inputSchema: { type: "object", properties: { dias: { type: "integer", description: "1 a 30 (padrão 1)" }, empresa: ESQ_EMPRESA } },
      executar: novas,
    },
    {
      nome: "licitacoes_disputas",
      titulo: "Disputas próximas",
      descricao: "Disputas (sessões) marcadas nos próximos N dias, separando as já em trabalho das ainda na Captação de edital. Padrão: 7 dias.",
      inputSchema: { type: "object", properties: { dias: { type: "integer", description: "1 a 60 (padrão 7)" }, empresa: ESQ_EMPRESA } },
      executar: disputas,
    },
    {
      nome: "licitacoes_edital",
      titulo: "Situação de um edital",
      descricao: "Situação de uma licitação: coluna, disputa, valor, responsável, deliberação, tarefas abertas e o resumo da análise. Busca por número do edital, órgão ou parte do título.",
      inputSchema: { type: "object", properties: { busca: { type: "string", description: "Número do edital, órgão ou parte do título" } }, required: ["busca"] },
      executar: edital,
    },
  ],
  prompts: [
    {
      nome: "licitacoes_semana",
      titulo: "Licitações da semana",
      descricao: "Disputas dos próximos 7 dias e o que entrou de novo.",
      texto: () => "Use o Sigma. Chame sigma_guia com dominio=licitacoes, depois licitacoes_disputas e licitacoes_novas com dias=7. Responda com as disputas já em trabalho (data, órgão, coluna), quantas ainda estão só captadas e quantas licitações novas chegaram.",
    },
    {
      nome: "licitacoes_edital_situacao",
      titulo: "Situação de um edital",
      descricao: "Coluna, disputa, tarefas e análise de um edital.",
      argumentos: [{ name: "busca", description: "Número do edital, órgão ou parte do título", required: true }],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=licitacoes, depois licitacoes_edital com busca=${a.busca}. Se casar com vários, pergunte qual antes de responder.`,
    },
  ],
};
