// Domínio "escalas" do protocolo do agente: plantões do Dr. Escala sincronizados pelo robô da VPS
// (docs/arquitetura/claude-socios-gss.md §3a-3c). Regras puras em ../../escalas.ts (testadas em escalas_test.ts).
// Os nomes e o texto das 4 ferramentas são os mesmos de antes do protocolo (T1): o Claude do Heron não percebe a troca.
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import {
  acharHospitais, agrupar, diaBR, filtroProfissional, hojeBR, lerData, lerMomento, linhaPlantao, type Local, momentoBR,
  periodoValido, type Plantao, resolverBusca, resumoPorHospital, somaDias,
} from "../../escalas.ts";
import { ErroFerramenta } from "../tipos.ts";

const COLS = "id,data,inicio,fim,local_id,hospital,setor,profissional_nome,profissional_crm,situacao,tipo,furo";
const LIMITE_LINHAS = 400;
// Toda consulta termina em .order("id"): sem desempate, dois plantões no mesmo horário saíam em ordem diferente a cada
// sincronização, e o mesmo fato virava outro texto e outro hash (achado na T2, 14/11).
const FONTE = "Dr. Escala";

async function frescor(ctx: Ctx): Promise<Fonte> {
  const { data } = await ctx.svc.from("drescala_sincronizacoes").select("concluido_em")
    .eq("status", "ok").order("concluido_em", { ascending: false }).limit(1).maybeSingle();
  return { nome: FONTE, atualizado_em: data?.concluido_em ?? null };
}

async function locais(ctx: Ctx): Promise<Local[]> {
  const { data, error } = await ctx.svc.from("drescala_locais").select("id,nome,cidade")
    .not("nome", "ilike", "%local teste%").order("nome");
  if (error) throw error;
  return data || [];
}

async function resolverHospital(ctx: Ctx, busca: unknown): Promise<{ ids: number[] | null; aviso?: string }> {
  if (!String(busca ?? "").trim()) return { ids: null };
  return resolverBusca(await locais(ctx), busca);
}

/** Nome não achado ou ambíguo: o fato é "não sei qual", e o guia manda o Claude perguntar ao usuário. */
const aviso = (texto: string, fonte: Fonte): Resultado => ({ resumo: texto, dados: { aviso: texto }, fonte });

/** Dado essencial de cada plantão para o hash (o texto é derivado dele). */
const fato = (rows: Plantao[]) => rows.map((r) => [r.id, r.data, r.inicio, r.fim, r.local_id, r.setor, r.profissional_crm ?? r.profissional_nome, r.furo]);

const cortado = (n: number, dica: string) => (n >= LIMITE_LINHAS ? { mostrados: LIMITE_LINHAS, dica } : undefined);

// O texto do corte vinha dentro do corpo antes do protocolo; agora é o `cortado` do Resultado (mesma frase).

async function escalasHospitais(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const fonte = await frescor(ctx);
  let ls = await locais(ctx);
  if (a.busca) {
    const ids = new Set(acharHospitais(ls, String(a.busca)).map((l) => l.id));
    ls = ls.filter((l) => ids.has(l.id));
  }
  const hoje = hojeBR(ctx.agora);
  const { data, error } = await ctx.svc.from("drescala_plantoes").select("local_id,furo")
    .gte("data", hoje).lte("data", somaDias(hoje, 6)).limit(20000);
  if (error) throw error;
  const cont = new Map<number, { t: number; f: number }>();
  for (const r of data || []) {
    const c = cont.get(r.local_id) || { t: 0, f: 0 };
    c.t++; if (r.furo) c.f++;
    cont.set(r.local_id, c);
  }
  const itens = ls.map((l) => ({ l, c: cont.get(l.id) || { t: 0, f: 0 } }))
    .filter((x) => a.busca || x.c.t > 0)
    .sort((x, y) => y.c.f - x.c.f || y.c.t - x.c.t);
  if (!itens.length) return { resumo: "Nenhum hospital encontrado.", dados: [], totais: { hospitais: 0 }, fonte };
  const linhas = itens.map((x) => `- ${x.l.nome}${x.l.cidade ? ` (${x.l.cidade})` : ""}: ${x.c.t} plantões, ${x.c.f} descobertos`);
  return {
    resumo: `Hospitais com plantão de ${diaBR(hoje)} a ${diaBR(somaDias(hoje, 6))}:`,
    corpo: "\n" + linhas.join("\n"),
    dados: { de: hoje, hospitais: itens.map((x) => [x.l.id, x.c.t, x.c.f]) },
    totais: { hospitais: itens.length, plantoes: itens.reduce((s, x) => s + x.c.t, 0), descobertos: itens.reduce((s, x) => s + x.c.f, 0) },
    fonte,
  };
}

async function escalasDoHospital(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const hoje = hojeBR(ctx.agora);
  const ini = lerData(a.data_inicio, undefined, hoje);
  const fim = lerData(a.data_fim, ini, hoje);
  if (!periodoValido(ini, fim, 31)) throw new ErroFerramenta("período inválido (data_fim antes do início ou mais de 31 dias)");
  const fonte = await frescor(ctx);
  const h = await resolverHospital(ctx, a.hospital);
  if (!h.ids) throw new ErroFerramenta("informe o hospital");
  if (h.aviso) return aviso(h.aviso, fonte);
  const { data, error } = await ctx.svc.from("drescala_escala_v").select(COLS).in("local_id", h.ids)
    .gte("data", ini).lte("data", fim).order("data").order("hospital").order("inicio").order("setor").order("id").limit(LIMITE_LINHAS);
  if (error) throw error;
  const rows = (data || []) as Plantao[];
  if (!rows.length) {
    return { resumo: `Nenhum plantão no Dr. Escala para esse hospital entre ${diaBR(ini)} e ${diaBR(fim)}.`, dados: { ini, fim, locais: h.ids, plantoes: [] }, totais: { plantoes: 0, descobertos: 0 }, fonte };
  }
  const furos = rows.filter((r) => r.furo).length;
  const nomes = [...new Set(rows.map((r) => r.hospital))].join("; ");
  return {
    resumo: `**${nomes}** — ${ini === fim ? diaBR(ini) : `${diaBR(ini)} a ${diaBR(fim)}`}: ${rows.length} plantões, ${furos} descobertos.`,
    corpo: agrupar(rows, h.ids.length > 1),
    dados: { ini, fim, locais: h.ids, plantoes: fato(rows) },
    totais: { plantoes: rows.length, descobertos: furos },
    cortado: cortado(rows.length, "peça um período menor."),
    fonte,
  };
}

async function plantoesDescobertos(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const hoje = hojeBR(ctx.agora);
  const ini = lerData(a.data_inicio, hoje, hoje);
  const fim = lerData(a.data_fim, somaDias(ini, 7), hoje);
  if (!periodoValido(ini, fim, 62)) throw new ErroFerramenta("período inválido (máx. 62 dias)");
  const fonte = await frescor(ctx);
  const h = await resolverHospital(ctx, a.hospital);
  if (h.aviso) return aviso(h.aviso, fonte);
  let q = ctx.svc.from("drescala_escala_v").select(COLS).eq("furo", true).gte("data", ini).lte("data", fim);
  if (h.ids) q = q.in("local_id", h.ids);
  const { data, error } = await q.order("data").order("hospital").order("inicio").order("setor").order("id").limit(LIMITE_LINHAS);
  if (error) throw error;
  const rows = (data || []) as Plantao[];
  if (!rows.length) return { resumo: `Nenhum plantão descoberto entre ${diaBR(ini)} e ${diaBR(fim)}.`, dados: { ini, fim, locais: h.ids, plantoes: [] }, totais: { descobertos: 0 }, fonte };
  return {
    resumo: `**${rows.length} plantões descobertos** de ${diaBR(ini)} a ${diaBR(fim)}. Por hospital: ${resumoPorHospital(rows)}.`,
    corpo: agrupar(rows, true),
    dados: { ini, fim, locais: h.ids, plantoes: fato(rows) },
    totais: { descobertos: rows.length },
    cortado: cortado(rows.length, "peça um período menor."),
    fonte,
  };
}

async function quemEstaEscalado(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const fonte = await frescor(ctx);
  const h = await resolverHospital(ctx, a.hospital);
  if (h.aviso) return aviso(h.aviso, fonte);
  const hoje = hojeBR(ctx.agora);
  if (a.profissional) {
    const p = String(a.profissional).trim();
    const ini = lerData(a.data_inicio, hoje, hoje);
    const fim = lerData(a.data_fim, somaDias(ini, 30), hoje);
    let q = ctx.svc.from("drescala_escala_v").select(COLS).gte("data", ini).lte("data", fim);
    const f = filtroProfissional(p);
    q = q.ilike(f.coluna, f.padrao);
    if (h.ids) q = q.in("local_id", h.ids);
    const { data, error } = await q.order("data").order("inicio").order("hospital").order("setor").order("id").limit(LIMITE_LINHAS);
    if (error) throw error;
    const rows = (data || []) as Plantao[];
    if (!rows.length) return { resumo: `Nenhum plantão de "${p}" entre ${diaBR(ini)} e ${diaBR(fim)}.`, dados: { p, ini, fim, plantoes: [] }, totais: { plantoes: 0 }, fonte };
    const nomes = [...new Set(rows.map((r) => r.profissional_nome))];
    return {
      resumo: `**${nomes.join("; ")}** — ${rows.length} plantões de ${diaBR(ini)} a ${diaBR(fim)}:`,
      corpo: agrupar(rows, true),
      dados: { p, ini, fim, plantoes: fato(rows) },
      totais: { plantoes: rows.length, profissionais: nomes.length },
      cortado: cortado(rows.length, "peça um período menor."),
      fonte,
    };
  }
  const quando = lerMomento(a.quando, ctx.agora);
  const iso = quando.toISOString();
  const diaQ = hojeBR(quando);
  // Plantão que começou até 1 dia antes e ainda não acabou.
  let q = ctx.svc.from("drescala_escala_v").select(COLS).gte("data", somaDias(diaQ, -1)).lte("data", diaQ)
    .lte("inicio", iso).gt("fim", iso);
  if (h.ids) q = q.in("local_id", h.ids);
  const { data, error } = await q.order("hospital").order("setor").order("inicio").order("id").limit(LIMITE_LINHAS);
  if (error) throw error;
  const rows = (data || []) as Plantao[];
  const momento = momentoBR(quando);
  if (!rows.length) {
    return { resumo: `Ninguém de plantão em ${momento}${h.ids ? " nesse hospital" : ""} segundo o Dr. Escala.`, dados: { iso, locais: h.ids, plantoes: [] }, totais: { medicos: 0, descobertos: 0 }, fonte };
  }
  const furos = rows.filter((r) => r.furo).length;
  let atual = "";
  const out: string[] = [];
  for (const r of rows) {
    if (r.hospital !== atual) { atual = r.hospital ?? ""; out.push(`\n### ${atual}`); }
    out.push(linhaPlantao(r));
  }
  return {
    resumo: `De plantão em ${momento}: ${rows.length - furos} médicos${furos ? `, ${furos} plantões descobertos` : ""}.`,
    corpo: out.join("\n"),
    dados: { iso, locais: h.ids, plantoes: fato(rows) },
    totais: { medicos: rows.length - furos, descobertos: furos },
    cortado: cortado(rows.length, "filtre por hospital."),
    fonte,
  };
}

export const escalas: Dominio = {
  id: "escalas",
  titulo: "Escalas e plantões (Dr. Escala)",
  versao: "1.0.0",
  status: "ativo",
  resumo: "plantões dos hospitais que a GSS escala, plantões descobertos (furos), quem está de plantão e a agenda de um médico.",
  frescor,
  guia: {
    proposito: "Responde sobre as escalas de plantão dos hospitais que a GSS atende, com o dado do Dr. Escala (o software de escalas da GSS), copiado para o Sigma pelo robô 3 vezes ao dia (6h, 12h e 18h).",
    glossario: [
      { termo: "Plantão", definicao: "um turno de um setor de um hospital num dia, com início e fim, que pode ter um médico escalado ou não." },
      { termo: "Plantão descoberto (furo)", definicao: "plantão sem médico alocado no Dr. Escala (\"Sem Profissional Alocado\"). É o que a operação precisa preencher." },
      { termo: "Hospital", definicao: "um \"local\" do Dr. Escala. Os locais de teste do Dr. Escala nunca aparecem." },
      { termo: "De plantão agora", definicao: "plantão que já começou e ainda não terminou no momento perguntado, em hora de Brasília." },
      { termo: "Hoje, amanhã, esta semana", definicao: "contados em hora de Brasília pelo servidor. \"Próximos 7 dias\" inclui hoje." },
    ],
    rotas: [
      { pergunta: "Quais hospitais a GSS escala / qual o nome certo de um hospital", ferramenta: "escalas_hospitais", observacao: "mostra plantões e furos dos próximos 7 dias" },
      { pergunta: "Como está a escala do hospital X num dia ou período", ferramenta: "escalas_do_hospital", observacao: "até 31 dias" },
      { pergunta: "Quais plantões estão descobertos", ferramenta: "plantoes_descobertos", observacao: "padrão de hoje a 7 dias; até 62 dias" },
      { pergunta: "Quem está de plantão agora / num horário", ferramenta: "quem_esta_escalado", observacao: "sem 'profissional'" },
      { pergunta: "Quais plantões o médico X tem", ferramenta: "quem_esta_escalado", observacao: "com 'profissional' (nome ou CRM)" },
    ],
    regras: [
      "Hospital pode ser pedido por sigla ou parte do nome (\"hro\", \"gaspar\", \"cepon\"). Se a ferramenta disser que casa com vários, pergunte qual.",
      "Diga sempre a hora da última sincronização quando falar da situação atual: o Dr. Escala pode ter mudado depois dela.",
      "Totais (plantões, descobertos, médicos) já vêm contados no resumo: repita-os, não reconte a lista.",
    ],
    limites: [
      "Não tem valor de plantão nem pagamento ao médico (isso é do financeiro).",
      "Não tem troca de plantão, confirmação de presença nem histórico de quem saiu da escala.",
      "Não tem conversa com os médicos escalistas (fase 2 do Claude dos sócios).",
    ],
  },
  ferramentas: [
    {
      nome: "escalas_hospitais",
      titulo: "Hospitais com escala no Dr. Escala",
      descricao: "Lista os hospitais/unidades que a GSS escala pelo Dr. Escala, com quantos plantões e quantos plantões descobertos (furos) há nos próximos 7 dias. Use para descobrir o nome certo de um hospital.",
      inputSchema: { type: "object", properties: { busca: { type: "string", description: "Parte do nome ou da cidade (opcional)" } } },
      executar: escalasHospitais,
    },
    {
      nome: "escalas_do_hospital",
      titulo: "Escala de um hospital",
      descricao: "Plantões de um hospital num dia ou período, por setor, com quem está escalado e os plantões descobertos. Aceita parte do nome ou sigla do hospital (ex.: 'hro', 'gaspar', 'cepon').",
      inputSchema: {
        type: "object",
        properties: {
          hospital: { type: "string", description: "Nome, parte do nome, cidade ou sigla do hospital" },
          data_inicio: { type: "string", description: "AAAA-MM-DD, DD/MM/AAAA, 'hoje' ou 'amanhã'" },
          data_fim: { type: "string", description: "Último dia (opcional; padrão = data_inicio; máx. 31 dias)" },
        },
        required: ["hospital", "data_inicio"],
      },
      executar: escalasDoHospital,
    },
    {
      nome: "plantoes_descobertos",
      titulo: "Plantões descobertos (furos)",
      descricao: "Plantões sem médico escalado num período, agrupados por dia e hospital. Padrão: de hoje a 7 dias.",
      inputSchema: {
        type: "object",
        properties: {
          data_inicio: { type: "string", description: "Padrão: hoje" },
          data_fim: { type: "string", description: "Padrão: data_inicio + 7 dias (máx. 62 dias)" },
          hospital: { type: "string", description: "Filtra um hospital (opcional)" },
        },
      },
      executar: plantoesDescobertos,
    },
    {
      nome: "quem_esta_escalado",
      titulo: "Quem está escalado",
      descricao: "Sem 'profissional': quem está de plantão num momento (padrão: agora), opcionalmente num hospital. Com 'profissional': os plantões desse médico no período.",
      inputSchema: {
        type: "object",
        properties: {
          quando: { type: "string", description: "Data e hora AAAA-MM-DDTHH:MM em hora de Brasília (padrão: agora)" },
          hospital: { type: "string", description: "Filtra um hospital (opcional)" },
          profissional: { type: "string", description: "Nome (ou parte) ou CRM do médico" },
          data_inicio: { type: "string", description: "Com profissional: início do período (padrão: hoje)" },
          data_fim: { type: "string", description: "Com profissional: fim do período (padrão: +30 dias)" },
        },
      },
      executar: quemEstaEscalado,
    },
  ],
  prompts: [
    {
      nome: "escalas_situacao_hoje",
      titulo: "Situação das escalas hoje",
      descricao: "Plantões descobertos de hoje e amanhã e quem está de plantão agora, por hospital.",
      texto: () => "Use o Sigma. Chame sigma_guia com dominio=escalas, depois plantoes_descobertos com data_inicio=hoje e data_fim=amanhã, e quem_esta_escalado sem argumentos. Responda com: total de furos por hospital, os furos de hoje primeiro, e quantos médicos estão de plantão agora. Cite a hora da sincronização.",
    },
    {
      nome: "escalas_furos_semana",
      titulo: "Furos da semana",
      descricao: "Plantões descobertos de hoje a 7 dias, por hospital.",
      argumentos: [{ name: "hospital", description: "Filtra um hospital (opcional)" }],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=escalas, depois plantoes_descobertos com data_inicio=hoje${a.hospital ? ` e hospital=${a.hospital}` : ""}. Responda com o total, a divisão por hospital e a lista por dia. Cite a hora da sincronização.`,
    },
    {
      nome: "escalas_hospital_periodo",
      titulo: "Escala de um hospital",
      descricao: "A escala de um hospital num dia ou período.",
      argumentos: [
        { name: "hospital", description: "Nome ou sigla do hospital", required: true },
        { name: "data", description: "Dia (hoje, amanhã, DD/MM)", required: true },
      ],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=escalas, depois escalas_do_hospital com hospital=${a.hospital} e data_inicio=${a.data}. Se o hospital for ambíguo, pergunte qual antes de responder. Responda com os totais e a escala por setor.`,
    },
  ],
};
