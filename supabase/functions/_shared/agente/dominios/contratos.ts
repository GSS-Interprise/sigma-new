// Domínio "contratos" do protocolo do agente (docs/arquitetura/protocolo-agente-sigma.md §3i; assistente do Sigma,
// fase 3, 22/11/2026). Mesmas regras dos cartões da tela de Contratos (ContratosMetrics.tsx); consultas em
// supabase/migrations/20261122100000_agente_contratos.sql. Definições:
//   - término = o do último aditivo de prazo, se houver; senão a data de término do contrato;
//   - vencido = contrato Ativo com término até hoje; a vencer = Ativo com término de amanhã até hoje + N dias;
//   - pendência = status Pendente/Aguardando ou assinatura pendente.
// Dentro do Sigma, quem só tem papel de licitação (licitador, líder de licitação) não vê a lista de contratos na tela,
// então também não recebe este domínio (regra na edge sigma-assistente, função veContratos).
import type { Ctx, Dominio, Fonte, Resultado } from "../tipos.ts";
import { ErroFerramenta } from "../tipos.ts";
import { diaBR, hojeBR, semAcento, somaDias } from "../tempo.ts";

const FONTE = "Sigma (Contratos)";
const MAX_LISTA = 25;

export type Base = {
  id: string; codigo_interno: number | null; codigo_contrato: string | null; cliente: string; uf: string | null;
  status_contrato: string; assinado: string | null; objeto: string | null; especialidade: string | null;
  valor_estimado: number | null; data_inicio: string | null; fim_efetivo: string | null; tem_anexo: boolean;
  itens: number; aditivos: number;
};
export type Item = { id: string; contrato_id: string; codigo_interno: number | null; cliente: string; item: string; quantidade: number | null; valor_item: number | null };

async function frescor(ctx: Ctx): Promise<Fonte> {
  const { data } = await ctx.svc.from("contratos").select("updated_at").order("updated_at", { ascending: false }).order("id").limit(1).maybeSingle();
  return { nome: `${FONTE}, última alteração de contrato`, atualizado_em: data?.updated_at ?? null };
}

async function base(ctx: Ctx): Promise<Base[]> {
  const { data, error } = await ctx.svc.rpc("agente_contratos_base");
  if (error) throw error;
  return (data || []) as Base[];
}

export const reais = (v: number | null | undefined, centavos = false) =>
  v == null || !Number(v) ? "valor não informado"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 }).replace(/\s/g, " ");

/** Situação de vencimento, igual aos cartões da tela. `hoje` = dia de Brasília (AAAA-MM-DD). */
export function situacao(c: Pick<Base, "status_contrato" | "fim_efetivo">, hoje: string, dias = 30): "vencido" | "a_vencer" | null {
  if (c.status_contrato !== "Ativo" || !c.fim_efetivo) return null;
  if (c.fim_efetivo <= hoje) return "vencido";
  if (c.fim_efetivo <= somaDias(hoje, dias)) return "a_vencer";
  return null;
}
export const pendente = (c: Pick<Base, "status_contrato" | "assinado">) =>
  c.status_contrato === "Pendente" || c.status_contrato === "Aguardando" || c.assinado === "Pendente";

const nomeContrato = (c: Pick<Base, "codigo_interno" | "cliente">) => `${c.codigo_interno != null ? `nº ${c.codigo_interno} · ` : ""}${c.cliente.replace(/\s+/g, " ").trim()}`;

/** Uma linha de contrato, sempre no mesmo formato. */
export function linhaContrato(c: Base): string {
  const partes = [c.fim_efetivo ? `término ${diaBR(c.fim_efetivo)}${c.aditivos ? " (com aditivo)" : ""}` : "sem data de término"];
  if (c.especialidade?.trim()) partes.push(c.especialidade.trim());
  if (c.uf) partes.push(c.uf);
  partes.push(reais(c.valor_estimado));
  return `- **${nomeContrato(c)}**: ${partes.join(" · ")}`;
}

async function panorama(ctx: Ctx): Promise<Resultado> {
  const cs = await base(ctx);
  const hoje = hojeBR(ctx.agora);
  const conta = (f: (c: Base) => boolean) => cs.filter(f).length;
  const t = {
    ativos: conta((c) => c.status_contrato === "Ativo"),
    inativos: conta((c) => c.status_contrato === "Inativo" || c.status_contrato === "Encerrado"),
    a_vencer_30: conta((c) => situacao(c, hoje) === "a_vencer"),
    vencidos: conta((c) => situacao(c, hoje) === "vencido"),
    pendencia: conta(pendente),
    ativos_sem_anexo: conta((c) => c.status_contrato === "Ativo" && !c.tem_anexo),
  };
  const outros = new Map<string, number>();
  for (const c of cs) if (!["Ativo", "Inativo", "Encerrado"].includes(c.status_contrato)) outros.set(c.status_contrato, (outros.get(c.status_contrato) ?? 0) + 1);
  const outrosTxt = [...outros].sort((a, b) => a[0].localeCompare(b[0])).map(([s, n]) => `${s} ${n}`).join(", ");
  return {
    resumo: `**Contratos**: ${t.ativos} ativos, ${t.vencidos} vencidos sem renovação registrada e ${t.a_vencer_30} vencendo nos próximos 30 dias.`,
    corpo: [
      "",
      `- Ativos: ${t.ativos} · Inativos/encerrados: ${t.inativos}${outrosTxt ? ` · Outros: ${outrosTxt}` : ""}`,
      `- Vencidos (ativos com término passado): ${t.vencidos}`,
      `- A vencer em 30 dias: ${t.a_vencer_30}`,
      `- Com pendência (assinatura ou status): ${t.pendencia}`,
      `- Ativos sem documento anexado: ${t.ativos_sem_anexo}`,
    ].join("\n"),
    dados: { hoje, ...t, outros: [...outros].sort((a, b) => a[0].localeCompare(b[0])) },
    totais: t,
    fonte: await frescor(ctx),
  };
}

async function vencimentos(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const dias = Math.round(Number(a.dias ?? 30));
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) throw new ErroFerramenta("dias deve ser de 1 a 365");
  const cs = await base(ctx);
  const hoje = hojeBR(ctx.agora);
  const porFim = (x: Base, y: Base) => (x.fim_efetivo! < y.fim_efetivo! ? -1 : x.fim_efetivo! > y.fim_efetivo! ? 1 : x.id < y.id ? -1 : 1);
  const aVencer = cs.filter((c) => situacao(c, hoje, dias) === "a_vencer").sort(porFim);
  const vencidos = cs.filter((c) => situacao(c, hoje, dias) === "vencido").sort(porFim);
  const fonte = await frescor(ctx);
  const periodo = `nos próximos ${dias} dias`;
  const blocos: string[] = [];
  if (aVencer.length) blocos.push(`\n### Vencem ${periodo}\n${aVencer.slice(0, MAX_LISTA).map(linhaContrato).join("\n")}`);
  if (vencidos.length) blocos.push(`\n### Já vencidos (ativos sem aditivo ou renovação depois do término)\n${vencidos.slice(0, MAX_LISTA).map(linhaContrato).join("\n")}`);
  const cortou = aVencer.length > MAX_LISTA || vencidos.length > MAX_LISTA;
  return {
    resumo: aVencer.length || vencidos.length
      ? `**${aVencer.length} contratos ativos vencem ${periodo}** e ${vencidos.length} já passaram do término sem aditivo registrado.`
      : `Nenhum contrato ativo vence ${periodo} e nenhum está vencido.`,
    corpo: blocos.join("\n") || undefined,
    dados: { hoje, dias, a_vencer: aVencer.map((c) => [c.id, c.fim_efetivo]), vencidos: vencidos.map((c) => [c.id, c.fim_efetivo]) },
    totais: { a_vencer: aVencer.length, vencidos: vencidos.length },
    cortado: cortou ? { mostrados: MAX_LISTA, dica: "a tela de Contratos tem a lista completa (cartões A vencer e Vencidos)" } : undefined,
    fonte,
  };
}

/** Busca do jeito que a pessoa fala: número interno, código do contrato, nome do cliente, objeto ou especialidade. */
export function acharContratos<T extends Pick<Base, "codigo_interno" | "codigo_contrato" | "cliente" | "objeto" | "especialidade">>(lista: T[], busca: string): T[] {
  const q = semAcento(busca).replace(/^(n[ºo°.]?\s*|contrato\s+)/, "").trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    const n = lista.filter((c) => String(c.codigo_interno ?? "") === q);
    if (n.length) return n;
  }
  const cod = lista.filter((c) => c.codigo_contrato && semAcento(c.codigo_contrato) === q);
  if (cod.length) return cod;
  const palavras = q.split(/\s+/).filter(Boolean);
  return lista.filter((c) => {
    const texto = semAcento([c.cliente, c.codigo_contrato, c.objeto, c.especialidade, c.codigo_interno].filter((x) => x != null).join(" "));
    return palavras.every((p) => texto.includes(p));
  });
}

async function contrato(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const busca = String(a.busca ?? "").trim();
  if (!busca) throw new ErroFerramenta("informe o número do contrato, o cliente (hospital, prefeitura) ou o objeto");
  const cs = await base(ctx);
  let achados = acharContratos(cs, busca);
  const ativos = achados.filter((c) => c.status_contrato === "Ativo");
  if (ativos.length === 1) achados = ativos;
  if (achados.length !== 1) {
    const texto = achados.length === 0
      ? `Nenhum contrato casa com "${busca}".`
      : `"${busca}" casa com ${achados.length} contratos. Pergunte qual: ${achados.slice(0, 8).map((c) => `${nomeContrato(c)} (${c.status_contrato}${c.especialidade ? `, ${c.especialidade.trim()}` : ""})`).join("; ")}`;
    return { resumo: texto, dados: { aviso: texto }, fonte: await frescor(ctx) };
  }
  const c = achados[0];
  const hoje = hojeBR(ctx.agora);
  const [{ data: itens }, { data: adit }, { data: renov }] = await Promise.all([
    ctx.svc.from("contrato_itens").select("item, quantidade, valor_item").eq("contrato_id", c.id).order("id"),
    ctx.svc.from("contrato_aditivos_tempo").select("data_inicio, data_termino, prazo_meses").eq("contrato_id", c.id).order("data_termino").order("id"),
    ctx.svc.from("contrato_renovacoes").select("data_vigencia, percentual_reajuste, valor").eq("contrato_id", c.id).order("data_vigencia").order("id"),
  ]);
  const is = (itens || []) as { item: string; quantidade: number | null; valor_item: number | null }[];
  const ad = (adit || []) as { data_inicio: string | null; data_termino: string | null; prazo_meses: number | null }[];
  const rn = (renov || []) as { data_vigencia: string | null; percentual_reajuste: number | null; valor: number | null }[];
  const sit = situacao(c, hoje);
  const vig = `${c.data_inicio ? diaBR(c.data_inicio) : "?"} a ${c.fim_efetivo ? diaBR(c.fim_efetivo) : "?"}${sit === "vencido" ? " (vencido)" : sit === "a_vencer" ? " (vence em até 30 dias)" : ""}`;
  const partes = [
    `\n- Situação: ${c.status_contrato}${c.assinado ? ` · assinatura ${c.assinado.toLowerCase()}` : ""}${c.tem_anexo ? "" : " · sem documento anexado"}`,
    `- Vigência: ${vig}`,
    `- Código: ${c.codigo_contrato || "sem código"} · valor estimado ${reais(c.valor_estimado)}${c.uf ? ` · ${c.uf}` : ""}`,
  ];
  if (c.objeto?.trim()) partes.push(`- Objeto: ${c.objeto.replace(/\s+/g, " ").trim().slice(0, 400)}`);
  partes.push(is.length
    ? `\n### Itens (${is.length})\n${is.slice(0, 30).map((i) => `- ${i.item.replace(/\s+/g, " ").trim().slice(0, 140)}: ${i.quantidade ?? "?"} × ${reais(i.valor_item, true)}`).join("\n")}${is.length > 30 ? `\n(mais ${is.length - 30} na tela)` : ""}`
    : "\nSem itens cadastrados.");
  if (ad.length) partes.push(`\n### Aditivos de prazo\n${ad.map((x) => `- até ${x.data_termino ? diaBR(x.data_termino) : "?"}${x.prazo_meses ? ` (${x.prazo_meses} meses)` : ""}`).join("\n")}`);
  if (rn.length) partes.push(`\n### Renovações e reajustes\n${rn.map((x) => `- ${x.data_vigencia ? diaBR(x.data_vigencia) : "?"}${x.percentual_reajuste != null ? ` · reajuste ${Number(x.percentual_reajuste).toLocaleString("pt-BR")}%` : ""}${x.valor ? ` · ${reais(x.valor)}` : ""}`).join("\n")}`);
  return {
    resumo: `**Contrato ${nomeContrato(c)}**: ${c.status_contrato}, vigência ${vig}.`,
    corpo: partes.join("\n"),
    dados: { id: c.id, status: c.status_contrato, fim: c.fim_efetivo, situacao: sit, itens: is.map((i) => [i.item, i.quantidade, i.valor_item]), aditivos: ad.length, renovacoes: rn.length },
    totais: { itens: is.length, aditivos: ad.length, renovacoes: rn.length },
    fonte: await frescor(ctx),
  };
}

/** Itens de contrato ativo que casam com a busca (todas as palavras, sem acento e sem caixa). */
export function acharItens<T extends Pick<Item, "item" | "cliente">>(lista: T[], busca: string): T[] {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [];
  return lista.filter((i) => { const t = semAcento(i.item); return palavras.every((p) => t.includes(p)); });
}

async function itensBusca(ctx: Ctx, a: Record<string, unknown>): Promise<Resultado> {
  const busca = String(a.busca ?? "").trim();
  if (busca.length < 3) throw new ErroFerramenta("informe o serviço ou procedimento (3 letras ou mais), ex.: ultrassom, plantão UTI");
  const { data, error } = await ctx.svc.rpc("agente_contratos_itens");
  if (error) throw error;
  let lista = (data || []) as Item[];
  if (a.cliente) {
    const q = semAcento(String(a.cliente));
    lista = lista.filter((i) => semAcento(i.cliente).includes(q));
  }
  const achados = acharItens(lista, busca);
  const fonte = await frescor(ctx);
  if (!achados.length) return { resumo: `Nenhum item de contrato ativo casa com "${busca}".`, dados: { busca, ids: [] }, totais: { itens: 0, contratos: 0 }, fonte };
  const contratos = new Set(achados.map((i) => i.contrato_id)).size;
  const valores = achados.map((i) => Number(i.valor_item)).filter((v) => v > 0).sort((x, y) => x - y);
  const faixa = !valores.length ? "" : valores[0] === valores[valores.length - 1]
    ? ` Valor unitário ${reais(valores[0], true)}.`
    : ` Valor unitário de ${reais(valores[0], true)} a ${reais(valores[valores.length - 1], true)}.`;
  const n = achados.length;
  const ordenados = [...achados].sort((x, y) => x.cliente.localeCompare(y.cliente, "pt-BR") || (x.id < y.id ? -1 : 1));
  return {
    resumo: `**${n} ${n === 1 ? "item" : "itens"} em ${contratos} ${contratos === 1 ? "contrato ativo" : "contratos ativos"}** ${n === 1 ? "casa" : "casam"} com "${busca}".${faixa}`,
    corpo: "\n" + ordenados.slice(0, MAX_LISTA).map((i) => `- **${nomeContrato(i)}**: ${i.item.replace(/\s+/g, " ").trim().slice(0, 140)} · ${i.quantidade ?? "?"} × ${reais(i.valor_item, true)}`).join("\n"),
    dados: { busca, cliente: a.cliente ?? null, ids: ordenados.map((i) => i.id) },
    totais: { itens: achados.length, contratos },
    cortado: achados.length > MAX_LISTA ? { mostrados: MAX_LISTA, dica: "refine a busca (ex.: o nome do hospital em cliente)" } : undefined,
    fonte,
  };
}

export const contratos: Dominio = {
  id: "contratos",
  titulo: "Contratos",
  versao: "1.0.0",
  status: "ativo",
  resumo: "contratos com clientes: panorama, vencimentos, situação de um contrato (itens, aditivos, reajustes) e itens por serviço.",
  frescor,
  guia: {
    proposito: "Responde sobre os contratos da GSS com clientes (hospitais, prefeituras) cadastrados na tela de Contratos do Sigma. Os números batem com os cartões da tela: ativos, vencidos, a vencer em 30 dias, pendência e sem anexo.",
    glossario: [
      { termo: "Término", definicao: "data final do contrato; se houver aditivo de prazo, vale a do último aditivo." },
      { termo: "Vencido", definicao: "contrato ainda marcado como Ativo cujo término já passou e não tem aditivo registrado depois. Pode ser renovação que ninguém lançou no Sigma." },
      { termo: "A vencer", definicao: "contrato Ativo com término de amanhã até N dias (a tela usa 30)." },
      { termo: "Pendência", definicao: "contrato com status Pendente ou Aguardando, ou com assinatura pendente." },
      { termo: "Item", definicao: "linha de serviço do contrato (plantão, consulta, laudo, exame) com quantidade e valor unitário." },
      { termo: "Aditivo de prazo", definicao: "prorrogação do contrato; muda o término." },
      { termo: "Renovação", definicao: "nova vigência com reajuste percentual e valor." },
    ],
    rotas: [
      { pergunta: "Como estão os contratos / quantos ativos, vencidos, com pendência", ferramenta: "contratos_panorama" },
      { pergunta: "Quais contratos vencem nos próximos dias / quais estão vencidos", ferramenta: "contratos_vencimentos", observacao: "dias: padrão 30" },
      { pergunta: "Como está o contrato de X / quais os itens e valores do contrato nº N", ferramenta: "contratos_contrato" },
      { pergunta: "Quanto cobramos de X / quais contratos têm o serviço Y", ferramenta: "contratos_itens" },
    ],
    regras: [
      "Contrato vencido é o que a tela mostra como vencido: diga que pode ser renovação não lançada, não afirme que o serviço parou.",
      "Valores são os cadastrados no contrato (estimado e unitário por item); não some faturamento nem calcule margem.",
      "Contrato pedido por parte do nome ou número; se a ferramenta disser que casa com vários, pergunte qual.",
    ],
    limites: [
      "Não tem faturamento, notas, pagamentos nem margem (isso é do Financeiro).",
      "Não tem as abas Dr. Escala, Dr. Oportunidade nem os contratos dos médicos (vencimentos dos médicos).",
      "Não lê o PDF do contrato: só o que foi cadastrado nos campos.",
      "Não cria, edita nem renova contrato: só leitura.",
    ],
  },
  ferramentas: [
    {
      nome: "contratos_panorama",
      titulo: "Panorama dos contratos",
      descricao: "Os mesmos números dos cartões da tela de Contratos: ativos, inativos, vencidos, a vencer em 30 dias, com pendência e ativos sem documento.",
      inputSchema: { type: "object", properties: {} },
      executar: (ctx) => panorama(ctx),
    },
    {
      nome: "contratos_vencimentos",
      titulo: "Vencimentos de contratos",
      descricao: "Contratos ativos que vencem nos próximos N dias (término considerando aditivos) e os que já passaram do término. Padrão: 30 dias.",
      inputSchema: { type: "object", properties: { dias: { type: "integer", description: "1 a 365 (padrão 30)" } } },
      executar: vencimentos,
    },
    {
      nome: "contratos_contrato",
      titulo: "Situação de um contrato",
      descricao: "Situação de um contrato: status, assinatura, vigência, valor estimado, objeto, itens com quantidade e valor unitário, aditivos e reajustes. Busca por número interno, código, cliente ou objeto.",
      inputSchema: { type: "object", properties: { busca: { type: "string", description: "Número interno, código, nome do cliente (hospital, prefeitura) ou objeto" } }, required: ["busca"] },
      executar: contrato,
    },
    {
      nome: "contratos_itens",
      titulo: "Itens por serviço",
      descricao: "Itens dos contratos ativos que casam com um serviço ou procedimento (ex.: ultrassom, plantão UTI, laudo de raio-X), com cliente, quantidade e valor unitário.",
      inputSchema: { type: "object", properties: { busca: { type: "string", description: "Serviço ou procedimento" }, cliente: { type: "string", description: "Opcional: só os contratos deste cliente" } }, required: ["busca"] },
      executar: itensBusca,
    },
  ],
  prompts: [
    {
      nome: "contratos_vencendo",
      titulo: "Contratos vencendo",
      descricao: "O que vence nos próximos 60 dias e o que já venceu.",
      texto: () => "Use o Sigma. Chame sigma_guia com dominio=contratos, depois contratos_vencimentos com dias=60. Responda com os que vencem (cliente, término) e quantos já passaram do término sem aditivo.",
    },
    {
      nome: "contratos_situacao",
      titulo: "Situação de um contrato",
      descricao: "Vigência, itens e reajustes de um contrato.",
      argumentos: [{ name: "busca", description: "Número, cliente ou objeto", required: true }],
      texto: (a) => `Use o Sigma. Chame sigma_guia com dominio=contratos, depois contratos_contrato com busca=${a.busca}. Se casar com vários, pergunte qual antes de responder.`,
    },
  ],
};
