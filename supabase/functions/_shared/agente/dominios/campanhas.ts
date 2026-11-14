// Domínio "campanhas" do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3i, T7).
// Campanhas de PROSPECÇÃO de médicos (tipo_campanha = 'prospeccao'). E-mail marketing fica fora.
// Fonte dos números: a MESMA RPC do Resumo da campanha (campanha_painel_dono), para o sócio e a tela verem o mesmo
// número. Os dois recortes que nenhuma tela entrega pronto (disparos de um dia e etapas do Kanban) estão na migration
// 20261114140000_agente_campanhas.sql, com as mesmas regras do painel. Definições fechadas com o Raul em 14/11/2026:
//   - campanha ativa = prospecção com status "ativa";
//   - convertido = status "convertido": marcado à mão pela equipe ou encaminhado para Contratos (etapa "na escala",
//     que grava o mesmo status).
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import { ErroFerramenta } from "../tipos.ts";
import { diaBR, hojeBR, lerData, momentoBR, semAcento } from "../tempo.ts";
import { agruparMotivos } from "../motivos.ts";

const FONTE = "Sigma (campanhas)";
const SITUACOES: Record<string, string[]> = { ativas: ["ativa"], pausadas: ["pausada"], finalizadas: ["finalizada"] };
const MAX_CAMPANHAS = 30;

type Campanha = {
  id: string; nome: string; status: string; tipo_envio: string | null; data_inicio: string | null; created_at: string;
  /** Outras campanhas que casaram com o nome pedido quando escolhemos a única ativa. */
  outras?: string[];
};
const outrasTexto = (c: Campanha) =>
  c.outras?.length ? `\n(Considerei a campanha ativa. Também casam com o nome: ${c.outras.slice(0, 6).join("; ")}.)` : "";
type Funil = {
  universo_cfm: number | null; na_lista: number; enviados: number; entregues: number; responderam: number;
  interessados: number; convertidos: number; falharam: number; sem_whatsapp: number; aguardando_envio: number;
  ultimo_envio: string | null;
};
type Painel = {
  funil: Funil;
  numeros: { numero: string; nome: string | null; enviados: number; entregues: number; responderam: number; falharam: number }[];
  email: { enviados: number; entregues: number; abertos: number; cliques: number } | null;
  erros: { motivo: string; n: number }[];
};

/** Frescor: o dado é ao vivo; a hora que importa é a do último envio de campanha. */
async function frescor(ctx: Ctx): Promise<Fonte> {
  const { data } = await ctx.svc.from("sigzap_messages").select("sent_at").eq("from_me", true)
    .not("campanha_lead_id", "is", null).order("sent_at", { ascending: false }).limit(1).maybeSingle();
  return { nome: `${FONTE}, último envio`, atualizado_em: data?.sent_at ?? null };
}
const agoraFonte = (ctx: Ctx): Fonte => ({ nome: `${FONTE}, ao vivo`, atualizado_em: ctx.agora.toISOString() });

const modo = (c: { tipo_envio: string | null }) => (c.tipo_envio === "manual" ? "manual" : "IA");
const quando = (iso: string | null) => (iso ? momentoBR(new Date(iso)) : "nunca");

async function listar(ctx: Ctx, status?: string[]): Promise<Campanha[]> {
  let q = ctx.svc.from("campanhas").select("id,nome,status,tipo_envio,data_inicio,created_at").eq("tipo_campanha", "prospeccao");
  if (status) q = q.in("status", status);
  const { data, error } = await q.order("nome").order("id");
  if (error) throw error;
  return (data || []) as Campanha[];
}

async function painel(ctx: Ctx, id: string): Promise<Painel> {
  const { data, error } = await ctx.svc.rpc("campanha_painel_dono", { p_campanha_id: id });
  if (error) throw error;
  return data as Painel;
}

/** Nome do jeito que o sócio fala: exato → trecho → todas as palavras. Vários = perguntar (regra 5 da constituição). */
export function acharCampanhas<T extends { nome: string }>(lista: T[], busca: string): T[] {
  const q = semAcento(busca);
  if (!q) return [];
  const exato = lista.filter((c) => semAcento(c.nome) === q);
  if (exato.length) return exato;
  const contem = lista.filter((c) => semAcento(c.nome).includes(q));
  if (contem.length) return contem;
  const palavras = q.split(/\s+/);
  return lista.filter((c) => palavras.every((p) => semAcento(c.nome).includes(p)));
}

/** Linha de funil com as mesmas palavras do glossário. */
export function linhaFunil(f: Funil): string {
  return `na lista ${f.na_lista} · enviados ${f.enviados} · responderam ${f.responderam} · interessados ${f.interessados} · convertidos ${f.convertidos}`;
}

async function campanhasAtivas(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const situacao = String(a.situacao ?? "ativas").trim().toLowerCase();
  if (!SITUACOES[situacao]) throw new ErroFerramenta(`situação inválida: ${situacao}. Use ativas, pausadas ou finalizadas.`);
  const fonte = agoraFonte(ctx);
  const cs = (await listar(ctx, SITUACOES[situacao])).slice(0, MAX_CAMPANHAS);
  if (!cs.length) return { resumo: `Nenhuma campanha de prospecção ${situacao.replace(/s$/, "")} no Sigma.`, dados: { situacao, campanhas: [] }, totais: { campanhas: 0 }, fonte };
  const ps = await Promise.all(cs.map((c) => painel(ctx, c.id)));
  const soma = (k: keyof Funil) => ps.reduce((s, p) => s + Number(p.funil[k] ?? 0), 0);
  const linhas = cs.map((c, i) => `- **${c.nome.trim()}** (${modo(c)}): ${linhaFunil(ps[i].funil)} · último envio ${quando(ps[i].funil.ultimo_envio)}`);
  return {
    resumo: `**${cs.length} campanhas de prospecção ${situacao}**: ${soma("enviados")} médicos receberam mensagem, ${soma("responderam")} responderam, ${soma("interessados")} interessados, ${soma("convertidos")} convertidos.`,
    corpo: "\n" + linhas.join("\n"),
    dados: { situacao, campanhas: cs.map((c, i) => [c.id, c.status, ps[i].funil.na_lista, ps[i].funil.enviados, ps[i].funil.responderam, ps[i].funil.interessados, ps[i].funil.convertidos]) },
    totais: { campanhas: cs.length, na_lista: soma("na_lista"), enviados: soma("enviados"), responderam: soma("responderam"), interessados: soma("interessados"), convertidos: soma("convertidos") },
    fonte,
  };
}

const ETAPAS: [string, string][] = [
  ["novo", "novo"], ["contatado", "contatado"], ["respondeu", "respondeu"], ["em_atendimento", "em atendimento"],
  ["qualificado", "qualificado"], ["encaminhado", "encaminhado"], ["convertido", "convertido"], ["perdido", "perdido"],
];

async function etapas(ctx: Ctx, id: string | null): Promise<Record<string, number>> {
  const { data, error } = await ctx.svc.rpc("agente_campanhas_etapas", { p_campanha: id });
  if (error) throw error;
  const m: Record<string, number> = {};
  for (const r of (data || []) as { etapa: string; medicos: number }[]) m[r.etapa] = Number(r.medicos);
  return m;
}
const linhaEtapas = (m: Record<string, number>) => ETAPAS.map(([k, r]) => `${r} ${m[k] ?? 0}`).join(" · ");

async function resolver(ctx: Ctx, busca: unknown): Promise<Campanha | Resultado> {
  const b = String(busca ?? "").trim();
  if (!b) throw new ErroFerramenta("informe a campanha (nome ou parte do nome)");
  const achadas = acharCampanhas(await listar(ctx), b);
  if (achadas.length === 1) return achadas[0];
  // Várias casam mas só uma está ativa: é dela que o sócio fala. A resposta cita as outras (campo `outras`).
  const ativas = achadas.filter((c) => c.status === "ativa");
  if (ativas.length === 1) return { ...ativas[0], outras: achadas.filter((c) => c !== ativas[0]).map((c) => c.nome.trim()) };
  const texto = achadas.length === 0
    ? `Nenhuma campanha de prospecção casa com "${b}". Use campanhas_ativas para ver os nomes.`
    : `"${b}" casa com ${achadas.length} campanhas. Pergunte qual: ${achadas.slice(0, 10).map((c) => `${c.nome.trim()} (${c.status})`).join("; ")}`;
  return { resumo: texto, dados: { aviso: texto }, fonte: await frescor(ctx) };
}

async function campanhasFunil(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const c = await resolver(ctx, a.campanha);
  if ("resumo" in c) return c;
  const [p, et] = await Promise.all([painel(ctx, c.id), etapas(ctx, c.id)]);
  const f = p.funil;
  // A RPC ordena só pela quantidade; com empate a ordem variava e o hash mudava. Desempate fixo aqui.
  const numeros = [...(p.numeros ?? [])].sort((x, y) => y.enviados - x.enviados || x.numero.localeCompare(y.numero));
  const motivos = agruparMotivos(p.erros ?? []);
  const partes = [
    `\n- Entregues ${f.entregues} · falharam ${f.falharam} · sem WhatsApp ${f.sem_whatsapp} · aguardando envio ${f.aguardando_envio}` +
      (f.universo_cfm != null ? ` · médicos da especialidade no CFM ${f.universo_cfm}` : ""),
    `- Último envio: ${quando(f.ultimo_envio)}`,
    `\n### Acompanhamento (Kanban: só quem respondeu ou foi movido pela equipe)\n${linhaEtapas(et)}`,
  ];
  if (numeros.length) {
    partes.push("\n### Por número que disparou", ...numeros.map((n) =>
      `- ${n.nome ? `${n.nome} ` : ""}${n.numero}: enviados ${n.enviados}, entregues ${n.entregues}, responderam ${n.responderam}, falharam ${n.falharam}`));
  }
  if (motivos.length) partes.push("\n### Motivo das falhas", ...motivos.map((e) => `- ${e.motivo}: ${e.n}`));
  if (p.email) partes.push(`\n### E-mail\nenviados ${p.email.enviados} · entregues ${p.email.entregues} · abertos ${p.email.abertos} · cliques ${p.email.cliques}`);
  return {
    resumo: `**${c.nome.trim()}** (${c.status}, ${modo(c)}): ${linhaFunil(f)}.${outrasTexto(c)}`,
    corpo: partes.join("\n"),
    dados: { id: c.id, funil: f, etapas: et, numeros, motivos, email: p.email },
    totais: { na_lista: f.na_lista, enviados: f.enviados, entregues: f.entregues, responderam: f.responderam, interessados: f.interessados, convertidos: f.convertidos, falharam: f.falharam },
    fonte: agoraFonte(ctx),
  };
}

async function campanhasDisparosDia(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const hoje = hojeBR(ctx.agora);
  const dia = lerData(a.data, hoje, hoje);
  if (dia > hoje) throw new ErroFerramenta("data no futuro: disparo só existe depois de acontecer");
  const { data, error } = await ctx.svc.rpc("agente_campanhas_disparos_dia", { p_dia: dia });
  if (error) throw error;
  const rows = (data || []) as { campanha_id: string; campanha: string; status: string; tipo_envio: string | null; enviados: number; falharam: number }[];
  const env = rows.reduce((s, r) => s + Number(r.enviados), 0);
  const fal = rows.reduce((s, r) => s + Number(r.falharam), 0);
  const fonte = await frescor(ctx);
  if (!rows.length) return { resumo: `Nenhum médico recebeu a primeira mensagem de campanha em ${diaBR(dia)}.`, dados: { dia, campanhas: [] }, totais: { enviados: 0, falharam: 0, campanhas: 0 }, fonte };
  return {
    resumo: `**${diaBR(dia)}**: ${env} médicos receberam a primeira mensagem de campanha e ${fal} não receberam (todas as tentativas falharam), em ${rows.length} campanhas.`,
    corpo: "\n" + rows.map((r) => `- ${r.campanha.trim()} (${r.status}, ${modo(r)}): ${r.enviados} receberam, ${r.falharam} não receberam`).join("\n"),
    dados: { dia, campanhas: rows.map((r) => [r.campanha_id, Number(r.enviados), Number(r.falharam)]) },
    totais: { enviados: env, falharam: fal, campanhas: rows.length },
    fonte,
  };
}

async function campanhasAcompanhamento(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  let c: Campanha | null = null;
  if (String(a.campanha ?? "").trim()) {
    const r = await resolver(ctx, a.campanha);
    if ("resumo" in r) return r;
    c = r;
  }
  const et = await etapas(ctx, c?.id ?? null);
  const total = Object.values(et).reduce((s, n) => s + n, 0);
  return {
    resumo: `**Acompanhamento ${c ? `de ${c.nome.trim()}` : "de todas as campanhas"}**: ${total} médicos no Kanban. ${linhaEtapas(et)}.${c ? outrasTexto(c) : ""}`,
    dados: { campanha: c?.id ?? null, etapas: et },
    totais: { medicos: total, ...Object.fromEntries(ETAPAS.map(([k]) => [k, et[k] ?? 0])) },
    fonte: agoraFonte(ctx),
  };
}

export const campanhas: Dominio = {
  id: "campanhas",
  titulo: "Campanhas de prospecção",
  versao: "1.0.0",
  status: "ativo",
  resumo: "campanhas de prospecção de médicos: ativas, funil de cada uma, disparos do dia e o acompanhamento (Kanban).",
  frescor,
  guia: {
    proposito: "Responde sobre as campanhas de prospecção de médicos da GSS no Sigma (WhatsApp pela API oficial, com IA ou com a equipe conversando). Os números são os mesmos do Resumo da campanha e do Kanban de acompanhamento, ao vivo.",
    glossario: [
      { termo: "Campanha ativa", definicao: "campanha de prospecção com status \"ativa\" no Sigma. Pausadas e finalizadas só entram se o usuário pedir; e-mail marketing não é deste assunto." },
      { termo: "Modo IA / manual", definicao: "IA: a IA conversa com o médico e passa para a equipe quando ele esquenta. Manual: a equipe conversa pelo Sigma desde a primeira resposta." },
      { termo: "Na lista", definicao: "médicos que estão na lista da campanha." },
      { termo: "Enviado", definicao: "médico que recebeu ao menos uma mensagem da campanha. Conta uma vez por médico, mesmo com reenvio." },
      { termo: "Entregue", definicao: "o WhatsApp confirmou entrega ou leitura." },
      { termo: "Falhou", definicao: "todas as tentativas de envio para o médico falharam (número sem WhatsApp, bloqueio da Meta etc.)." },
      { termo: "Respondeu", definicao: "médico que mandou mensagem depois do primeiro envio da campanha." },
      { termo: "Interessado", definicao: "médico quente ou convertido no Kanban, ou com a conversa classificada como interessado (mesma regra do Raio-X)." },
      { termo: "Convertido", definicao: "médico marcado como convertido pela equipe ou encaminhado para Contratos (etapa \"na escala\"). Depende de a equipe registrar no Kanban." },
      { termo: "Disparo do dia", definicao: "médico que recebeu a PRIMEIRA mensagem da campanha naquele dia, em hora de Brasília. Reenvio e conversa não contam." },
      { termo: "Etapas do acompanhamento", definicao: "as colunas do Kanban: novo, contatado, respondeu, em atendimento (alguém da equipe assumiu), qualificado, encaminhado (avançou na oportunidade), convertido, perdido. Em campanha com IA o Kanban só mostra quem respondeu ou foi movido pela equipe; quem só recebeu a mensagem está em \"enviados\", não no Kanban." },
    ],
    rotas: [
      { pergunta: "Quais campanhas estão rodando / como estão as campanhas", ferramenta: "campanhas_ativas", observacao: "padrão: ativas; situacao=pausadas ou finalizadas se pedirem" },
      { pergunta: "Como está a campanha X (funil, números que disparam, falhas)", ferramenta: "campanhas_funil" },
      { pergunta: "Quantos disparos saíram hoje / num dia", ferramenta: "campanhas_disparos_dia" },
      { pergunta: "Quantos médicos em atendimento, qualificados, convertidos (Kanban)", ferramenta: "campanhas_acompanhamento", observacao: "sem campanha = todas" },
    ],
    regras: [
      "Use as palavras do glossário: \"enviados\", \"responderam\", \"interessados\", \"convertidos\". Não troque por \"leads\", \"conversões\" ou taxas que a ferramenta não deu.",
      "Taxa só se o usuário pedir, e sempre dizendo sobre o quê (ex.: responderam ÷ enviados).",
      "Convertido depende de a equipe marcar no Kanban: se o número parecer baixo, diga isso em vez de supor.",
      "Campanha pedida por parte do nome; se a ferramenta disser que casa com várias, pergunte qual. Se ela disser que considerou a ativa, diga isso ao usuário.",
    ],
    limites: [
      "Não mostra o texto das respostas dos médicos (aguarda a decisão de dados pessoais).",
      "Não tem campanhas de e-mail marketing nem orçamento/custo de campanha.",
      "Não tem os toques no Instagram e no LinkedIn por campanha.",
      "Não cria, pausa nem altera campanha: só leitura.",
    ],
  },
  ferramentas: [
    {
      nome: "campanhas_ativas",
      titulo: "Campanhas de prospecção",
      descricao: "Campanhas de prospecção de médicos com o funil de cada uma (na lista, enviados, responderam, interessados, convertidos) e o último envio. Padrão: as ativas.",
      inputSchema: {
        type: "object",
        properties: { situacao: { type: "string", enum: ["ativas", "pausadas", "finalizadas"], description: "Padrão: ativas" } },
      },
      executar: campanhasAtivas,
    },
    {
      nome: "campanhas_funil",
      titulo: "Funil de uma campanha",
      descricao: "O Resumo de uma campanha: funil completo, etapas do Kanban, desempenho por número de WhatsApp, motivos das falhas e e-mail. Aceita parte do nome.",
      inputSchema: {
        type: "object",
        properties: { campanha: { type: "string", description: "Nome ou parte do nome da campanha" } },
        required: ["campanha"],
      },
      executar: campanhasFunil,
    },
    {
      nome: "campanhas_disparos_dia",
      titulo: "Disparos de um dia",
      descricao: "Quantos médicos receberam a primeira mensagem de campanha num dia, e quantos envios falharam, por campanha. Padrão: hoje.",
      inputSchema: {
        type: "object",
        properties: { data: { type: "string", description: "AAAA-MM-DD, DD/MM/AAAA, 'hoje' ou 'ontem' (padrão: hoje)" } },
      },
      executar: campanhasDisparosDia,
    },
    {
      nome: "campanhas_acompanhamento",
      titulo: "Acompanhamento (Kanban)",
      descricao: "Quantos médicos estão em cada etapa do Kanban de acompanhamento (novo, contatado, respondeu, em atendimento, qualificado, encaminhado, convertido, perdido), de uma campanha ou de todas.",
      inputSchema: {
        type: "object",
        properties: { campanha: { type: "string", description: "Nome ou parte do nome (opcional; sem = todas)" } },
      },
      executar: campanhasAcompanhamento,
    },
  ],
  prompts: [
    {
      nome: "campanhas_situacao",
      titulo: "Situação das campanhas",
      descricao: "Campanhas ativas com o funil e os disparos de hoje.",
      texto: () => "Use o Sigma. Chame sigma_guia com dominio=campanhas, depois campanhas_ativas e campanhas_disparos_dia. Responda com: quantas campanhas ativas, o funil de cada uma (enviados, responderam, interessados, convertidos) e quantos médicos receberam a primeira mensagem hoje.",
    },
    {
      nome: "campanhas_resumo",
      titulo: "Resumo de uma campanha",
      descricao: "Funil, Kanban, números que disparam e falhas de uma campanha.",
      argumentos: [{ name: "campanha", description: "Nome ou parte do nome", required: true }],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=campanhas, depois campanhas_funil com campanha=${a.campanha}. Se casar com várias, pergunte qual antes de responder. Responda com o funil, as etapas do Kanban e, se houver falhas, o principal motivo.`,
    },
  ],
};
