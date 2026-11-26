// Domínio "atendimento" do protocolo do agente: quem está sem responder nos números oficiais e o tempo de resposta
// por pessoa (docs/arquitetura/tempo-de-resposta-atendimento.md §3f). Mesmas regras da tela Tempo de resposta e dos
// avisos: atendimento_aguardando_base() e atendimento_indicadores_base() (migration 20261122120000/121000).
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import { ErroFerramenta } from "../tipos.ts";
import { semAcento } from "../tempo.ts";

const FONTE = "Sigma (números oficiais do WhatsApp)";
const MAX_LISTA = 20;

type Espera = {
  conversation_id: string; contato_nome: string; numero: string; responsavel_id: string | null; responsavel_nome: string | null;
  esperando_desde: string; mensagens: number; ia_atuando: boolean; contato_marcado: string | null;
};
type Indicador = { pessoa_id: string | null; pessoa: string; esperas: number; respondidas: number; mediana_min: number | null; em_10min: number; sem_resposta: number };

const aoVivo = (ctx: Ctx): Fonte => ({ nome: `${FONTE}, ao vivo`, atualizado_em: ctx.agora.toISOString() });
async function frescor(ctx: Ctx): Promise<Fonte> {
  const { data } = await ctx.svc.from("whatsapp_chakra_connections").select("last_webhook_event_at").eq("status", "connected")
    .order("last_webhook_event_at", { ascending: false, nullsFirst: false }).order("id").limit(1).maybeSingle();
  return { nome: `${FONTE}, última mensagem recebida`, atualizado_em: data?.last_webhook_event_at ?? null };
}

export const tempo = (min: number) =>
  min < 60 ? `${min} min` : min < 2880 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${Math.floor(min / 1440)} dias`;
const minutos = (iso: string, agora: Date) => Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));

async function aguardando(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const horas = Math.round(Number(a.horas ?? 24));
  if (!Number.isFinite(horas) || horas < 1 || horas > 168) throw new ErroFerramenta("horas deve ser de 1 a 168");
  const { data, error } = await ctx.svc.rpc("atendimento_aguardando_base", { p_dias: Math.ceil(horas / 24) });
  if (error) throw error;
  const limite = ctx.agora.getTime() - horas * 3_600_000;
  let lista = ((data || []) as Espera[]).filter((e) => new Date(e.esperando_desde).getTime() >= limite);
  if (a.pessoa) {
    const q = semAcento(String(a.pessoa));
    lista = lista.filter((e) => semAcento(e.responsavel_nome || "sem responsavel").includes(q));
  }
  const pessoas = lista.filter((e) => !e.ia_atuando).sort((x, y) => x.esperando_desde.localeCompare(y.esperando_desde) || x.conversation_id.localeCompare(y.conversation_id));
  const ia = lista.length - pessoas.length;
  const periodo = horas === 24 ? "nas últimas 24 h" : `nas últimas ${horas} h`;
  const porPessoa = new Map<string, number>();
  for (const e of pessoas) { const k = e.responsavel_nome || "Sem responsável no número"; porPessoa.set(k, (porPessoa.get(k) ?? 0) + 1); }
  const resumoPessoas = [...porPessoa].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([n, q]) => `${n} ${q}`).join(", ");
  if (!pessoas.length) {
    return { resumo: `Ninguém esperando resposta de uma pessoa ${periodo}${ia ? ` (${ia} com a IA atuando)` : ""}.`, dados: { horas, ids: [], ia }, totais: { esperando: 0, ia_atuando: ia }, fonte: aoVivo(ctx) };
  }
  const maior = minutos(pessoas[0].esperando_desde, ctx.agora);
  return {
    resumo: `**${pessoas.length} conversas esperando resposta** ${periodo}; a mais antiga há ${tempo(maior)}. Por pessoa: ${resumoPessoas}.${ia ? ` Outras ${ia} estão com a IA atuando.` : ""}`,
    corpo: "\n" + pessoas.slice(0, MAX_LISTA).map((e) =>
      `- **${(e.contato_marcado ? `${e.contato_marcado} (contato marcado)` : e.contato_nome).replace(/\s+/g, " ").trim().slice(0, 60)}**: há ${tempo(minutos(e.esperando_desde, ctx.agora))}${e.mensagens > 1 ? `, ${e.mensagens} mensagens` : ""} · número final ${e.numero.replace(/\D/g, "").slice(-4)} · ${e.responsavel_nome || "sem responsável"}`).join("\n"),
    dados: { horas, pessoa: a.pessoa ?? null, esperas: pessoas.map((e) => [e.conversation_id, e.esperando_desde]), ia },
    totais: { esperando: pessoas.length, ia_atuando: ia },
    cortado: pessoas.length > MAX_LISTA ? { mostrados: MAX_LISTA, dica: "a tela Tempo de resposta tem a fila completa" } : undefined,
    fonte: aoVivo(ctx),
  };
}

async function indicadores(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const dias = Math.round(Number(a.dias ?? 1));
  if (!Number.isFinite(dias) || dias < 1 || dias > 31) throw new ErroFerramenta("dias deve ser de 1 a 31");
  // Dia de Brasília: "hoje" começa à meia-noite de Brasília (03:00 UTC).
  const br = new Date(ctx.agora.getTime() - 3 * 3_600_000);
  const inicio = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - (dias - 1), 3));
  const de = inicio.toISOString(), ate = ctx.agora.toISOString();
  // Os 3 cartões do topo da tela Tempo de resposta saem da série (atendimento_serie: dentro da meta, sem resposta, IA)
  // e a mediana das pessoas ponderada pelas respondidas (TempoDeResposta.tsx). Mesma conta aqui para o número bater.
  const [ind, ser, cfg] = await Promise.all([
    ctx.svc.rpc("atendimento_indicadores_base", { p_de: de, p_ate: ate }),
    ctx.svc.rpc("atendimento_serie_base", { p_de: de, p_ate: ate, p_bucket: dias === 1 ? "hour" : "day", p_uso: null }),
    ctx.svc.from("atendimento_config").select("meta_pct").eq("id", true).maybeSingle(),
  ]);
  if (ind.error) throw ind.error;
  if (ser.error) throw ser.error;
  const ls = ((ind.data || []) as Indicador[]).sort((x, y) => y.esperas - x.esperas || x.pessoa.localeCompare(y.pessoa));
  const pts = (ser.data || []) as { esperas: number; em_meta: number; sem_resposta: number; automaticas: number }[];
  const tot = pts.reduce((s, p) => ({ esp: s.esp + Number(p.esperas), meta: s.meta + Number(p.em_meta), sem: s.sem + Number(p.sem_resposta), auto: s.auto + Number(p.automaticas) }), { esp: 0, meta: 0, sem: 0, auto: 0 });
  const metaPct = Number(cfg.data?.meta_pct ?? 80);
  const periodo = dias === 1 ? "hoje" : `nos últimos ${dias} dias`;
  const humanas = ls.filter((l) => !l.pessoa.startsWith("Automático"));
  const respondidas = humanas.reduce((s, l) => s + l.respondidas, 0);
  const mediana = respondidas ? Math.round(humanas.reduce((s, l) => s + Number(l.mediana_min ?? 0) * l.respondidas, 0) / respondidas) : null;
  const pct = tot.esp ? Math.round((100 * tot.meta) / tot.esp) : null;
  if (!ls.length && !tot.esp) return { resumo: `Ninguém escreveu para os números oficiais ${periodo}.`, dados: { dias, linhas: [] }, totais: { esperas: 0, sem_resposta: 0 }, fonte: await frescor(ctx) };
  const linha = (l: Indicador) => `- **${l.pessoa}**: ${l.respondidas} de ${l.esperas} respondidas · mediana ${l.mediana_min == null ? "—" : tempo(Math.round(Number(l.mediana_min)))} · ${l.esperas ? Math.round((100 * l.em_10min) / l.esperas) : 0}% em até 10 min · ${l.sem_resposta} sem resposta`;
  return {
    resumo: `**Tempo de resposta ${periodo}**: ${pct == null ? "—" : `${pct}%`} das conversas respondidas dentro da meta (meta ${metaPct}%; ${tot.meta} de ${tot.esp}). `
      + `Mediana até a 1ª resposta: ${mediana == null ? "—" : tempo(mediana)} (${respondidas} respondidas por pessoas). `
      + `${tot.sem} ficaram sem resposta${tot.auto ? `; a IA respondeu outras ${tot.auto} sozinha` : ""}.`,
    corpo: "\n**Por pessoa:**\n" + ls.map(linha).join("\n"),
    dados: { dias, linhas: ls.map((l) => [l.pessoa, l.esperas, l.respondidas, l.mediana_min == null ? null : Number(l.mediana_min), l.em_10min, l.sem_resposta]) },
    totais: { esperas: tot.esp, dentro_da_meta: tot.meta, pct_dentro_da_meta: pct, meta_pct: metaPct, mediana_min: mediana, respondidas_por_pessoas: respondidas, sem_resposta: tot.sem, ia_sozinha: tot.auto },
    fonte: await frescor(ctx),
  };
}

export const atendimento: Dominio = {
  id: "atendimento",
  titulo: "Tempo de resposta",
  versao: "1.1.0",
  status: "ativo",
  resumo: "quem está esperando resposta nos números oficiais do WhatsApp e o tempo de resposta de cada pessoa.",
  frescor,
  guia: {
    proposito: "Responde quem da equipe está sem responder médicos e clientes nos números oficiais do WhatsApp (os conectados à API oficial, inclusive o que a equipe digita no celular), e o tempo de resposta por pessoa. Mesmos números da tela Tempo de resposta do Sigma.",
    glossario: [
      { termo: "Esperando resposta", definicao: "a última mensagem da conversa é do contato e ninguém respondeu nem encerrou a conversa depois. A espera conta desde a primeira mensagem sem resposta." },
      { termo: "De quem é", definicao: "a pessoa marcada como responsável pelo número no Sigma. Número sem responsável aparece como \"sem responsável\"." },
      { termo: "IA atuando", definicao: "conversa de campanha em que a IA responde sozinha; não conta como espera de uma pessoa." },
      { termo: "Contato marcado", definicao: "cliente ou contato importante que a coordenação marcou com nome no Sigma." },
      { termo: "Mediana", definicao: "tempo do meio até a primeira resposta (metade foi mais rápida, metade mais lenta). O número geral é a mediana de cada pessoa ponderada pelas respostas dela, igual ao cartão da tela." },
      { termo: "Dentro da meta", definicao: "conversa respondida dentro do prazo do tipo de contato (médico, cliente, pessoa-chave; 10 min por padrão). É o % do cartão do topo da tela Tempo de resposta; a meta da GSS (ex.: 80%) fica em Tempo de resposta › Avisos." },
      { termo: "Espera você agora", definicao: "conversas esperando uma pessoa nas últimas 24 h, sem IA atuando: o total de atendimento_aguardando (padrão 24 h), igual ao cartão grande da tela." },
      { termo: "Pedido de descadastro", definicao: "\"SAIR\" e parecidos não contam como espera." },
    ],
    rotas: [
      { pergunta: "Quem está sem responder agora / tem conversa esperando", ferramenta: "atendimento_aguardando", observacao: "horas: padrão 24; pessoa: filtra pelo responsável" },
      { pergunta: "Como está o tempo de resposta da equipe hoje / na semana; taxa de resposta em até 10 min / dentro da meta; mediana; quantas ficaram sem resposta", ferramenta: "atendimento_indicadores", observacao: "dias: 1 = hoje (Hoje da tela), 7 = 7 dias, 30 = 30 dias. Use os números do resumo: são os cartões da tela." },
    ],
    regras: [
      "Diga o período (últimas 24 h, hoje, semana) junto com o número.",
      "Número sem responsável: diga que não dá para saber quem demorou e que o responsável se define em Números WhatsApp.",
      "Não julgue a pessoa nem o conteúdo da resposta: a ferramenta só mede tempo.",
    ],
    limites: [
      "Só os números conectados à API oficial (Chakra). WhatsApp pessoal fora do Sigma e números não oficiais não entram.",
      "Mede tempo, não a qualidade da resposta.",
      "Não mostra o texto das conversas além do nome do contato.",
    ],
  },
  ferramentas: [
    {
      nome: "atendimento_aguardando",
      titulo: "Conversas esperando resposta",
      descricao: "Conversas nos números oficiais do WhatsApp esperando resposta de uma pessoa: há quanto tempo, de quem é o número, se é contato marcado. Padrão: esperas das últimas 24 h.",
      inputSchema: { type: "object", properties: { horas: { type: "integer", description: "1 a 168 (padrão 24)" }, pessoa: { type: "string", description: "Opcional: nome de quem está com o número" } } },
      executar: aguardando,
    },
    {
      nome: "atendimento_indicadores",
      titulo: "Tempo de resposta por pessoa",
      descricao: "Por pessoa: conversas que pediram resposta, respondidas, mediana até a 1ª resposta, % em até 10 min e sem resposta. Padrão: hoje.",
      inputSchema: { type: "object", properties: { dias: { type: "integer", description: "1 = hoje; até 31" } } },
      executar: indicadores,
    },
  ],
  prompts: [
    {
      nome: "atendimento_quem_esta_devendo",
      titulo: "Quem está sem responder",
      descricao: "Conversas esperando resposta agora e o tempo de resposta de hoje.",
      texto: () => "Use o Sigma. Chame sigma_guia com dominio=atendimento, depois atendimento_aguardando e atendimento_indicadores. Responda com quantas conversas esperam, a mais antiga, por pessoa, e a mediana de hoje.",
    },
  ],
};
