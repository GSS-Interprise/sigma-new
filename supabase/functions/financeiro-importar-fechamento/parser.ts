// Parsers do import de fechamento. Separado do index.ts pra poder rodar sozinho
// (ver _test_parser.ts) — parse de dinheiro/hora é onde erro passa despercebido.

export const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const digits = (s: string) => (s || "").replace(/[^0-9]/g, "");

/** Nome limpo para casar médico: a planilha da equipe anota instrução no próprio nome
 *  ("Rafael Oku Fernandes (PAGAR RDI)", "Heron Gustavo Zini (PAGAR Renan Augusto Zini)"). */
export const nomeLimpo = (s: string) => (s || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

/** Padrão ilike tolerante a acento: 'Patrícia' → 'Patr_cia'. O ilike do Postgres é
 *  sensível a acento nos DOIS sentidos, então sem isso o candidato nunca entra no pool
 *  e a normalização em JS não chega a ser aplicada. */
// Padrão de busca no banco (ilike), largo de propósito: o casamento fino é por norm() depois.
// O ilike não ignora acento, e o acento pode estar só de um lado: "Goncalves" na planilha não achava
// "GONÇALVES" no cadastro (Ana Luisa, 20/10). Por isso letra que pode ter acento vira "_" (um caractere
// qualquer), e o "%" nas pontas cobre espaço sobrando no cadastro ("Priscila Souza Sales ").
export const padraoSemAcento = (s: string) =>
  "%" + nomeLimpo(s).replace(/[^A-Za-z0-9 .,'-]/g, "_").replace(/[aeioucnAEIOUCN]/g, "_") + "%";
// Busca larga pelo primeiro e último nome ("%eduardo%bon%"): a planilha abrevia o nome do meio
// ("Eduardo Bon" para EDUARDO DA SILVA BON, Tijucas/setembro, 23/10). O casamento fino fica no index.
export const padraoPrimeiroUltimo = (s: string) => {
  const t = nomeLimpo(s).split(" ").filter(Boolean);
  if (t.length < 2) return null;
  const nucleo = (w: string) => w.replace(/[^A-Za-z0-9.,'-]/g, "_").replace(/[aeioucnAEIOUCN]/g, "_");
  // primeiro e último da PLANILHA: cobre tanto o nome do meio quanto o último sobrenome faltando no cadastro
  return `%${nucleo(t[0])}%${nucleo(t[t.length - 1])}%`;
};
// Sem o primeiro nome: pega cadastro quando a planilha erra o primeiro nome ("Gulherme Guiss Maciel" para
// GUILHERME GUISS MACIEL, Penha, 26/10). Também largo; o casamento fino continua no index.
export const padraoSemPrimeiro = (s: string) => {
  const t = nomeLimpo(s).split(" ").filter((w) => w.length > 2);
  if (t.length < 2) return null;
  const nucleo = (w: string) => w.replace(/[^A-Za-z0-9.,'-]/g, "_").replace(/[aeioucnAEIOUCN]/g, "_");
  return t.length === 2 ? `%${nucleo(t[1])}%` : `%${nucleo(t[1])}%${nucleo(t[t.length - 1])}%`;
};
export const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const filled = (row: unknown[]) => row.filter((v) => cell(v) !== "").length;

// aceita "R$ 57.500,00", "1200", "2.280,50" (nbsp incluso)
export function num(v: unknown): number {
  // celula numerica do xlsx ja vem pronta - passar pela heuristica de milhar abaixo
  // corromperia 3 casas decimais (31694.775 viraria 31694775, como no Carestream).
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const raw = cell(v);
  if (!raw || raw === "-") return 0;
  let t = raw.replace(/[^0-9,.-]/g, "");
  // ponto so e separador de milhar quando ha virgula decimal ("1.234,56") ou
  // quando os grupos de 3 se repetem sem decimal ("1.234.567").
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}


export type Item = {
  data: string; hIni: string; hFim: string; minutos: number;
  setor: string; local: string; vHora: number; valor: number;
  tipo: string; aVista: boolean;
  // radiologia: agregado do mês por tipo de exame, sem data
  descricao?: string; quantidade?: number; valorUnitario?: number;
};
export type Bloco = {
  nome: string; crm: string; uf: string; cpf: string; unidade: string;
  itens: Item[]; checksum: number | null;
  acrescimos?: number; descontos?: number;
  // consolidado: a equipe informa o valor já pago à vista; as horas correspondentes
  // saem por proporção e podem ser corrigidas na tela
  aVistaValor?: number; aVistaMinutos?: number; plantoes?: number;
};

const itemVazio = (): Item => ({
  data: "", hIni: "", hFim: "", minutos: 0, setor: "", local: "",
  vHora: 0, valor: 0, tipo: "", aVista: false,
});

const MESES_ABREV = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/**
 * Planilha com uma aba por mês (Marieta, CEPON): resolve a aba pela competência.
 * Aceita 'JUN', 'JUN CUSTO', 'Junho'… — casa pelo prefixo de 3 letras.
 */
export function abaDoMes(abas: string[], mes: number): string | null {
  const alvo = MESES_ABREV[mes - 1];
  if (!alvo) return null;
  return abas.find((a) => norm(a).toUpperCase().startsWith(norm(alvo).toUpperCase()))
      ?? abas.find((a) => norm(a).toUpperCase().includes(norm(alvo).toUpperCase()))
      ?? null;
}

const dataBR = (s: string): string | null => {
  const m = cell(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const horaDe = (s: string): string => {
  const m = cell(s).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
};
const durMin = (s: string): number => {
  const m = cell(s).match(/^(\d+):(\d{2})$/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
};

/** Horas do consolidado, que saem em três formatos diferentes do mesmo relatório:
 *  "246:00", "4 days, 0:00:00" (timedelta do Excel) e "54.0" (horas decimais). */
export function horasEmMinutos(v: unknown): number {
  if (typeof v === "number") return Math.round(v * 60);
  const t = cell(v);
  if (!t) return 0;
  const dias = t.match(/^(\d+)\s*days?,\s*(\d+):(\d{2})(?::(\d{2}))?$/i);
  if (dias) return (+dias[1]) * 24 * 60 + (+dias[2]) * 60 + (+dias[3]);
  const hm = t.match(/^(\d+):(\d{2})(?::\d{2})?$/);
  if (hm) return (+hm[1]) * 60 + (+hm[2]);
  const n = parseFloat(t.replace(",", "."));
  return isFinite(n) ? Math.round(n * 60) : 0;
}

/**
 * Relatório COMPLETO do Dr. Escala — layout hierárquico:
 *   hospital → (médico + CPF) → cabeçalho → plantões → "Total de X ... Valor Total Somado"
 * O cabeçalho é relido a cada bloco, então mudar a ordem das colunas não quebra.
 */
export function parseDrEscalaCompleto(grid: unknown[][]) {
  // período pode cruzar dois meses (21/08 a 20/09 = competência de setembro): guarda início e fim
  let mes = 0, ano = 0, mesFim = 0, anoFim = 0;
  for (const row of grid.slice(0, 10)) {
    const m = cell(row[0]).match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { mes = parseInt(m[2]); ano = parseInt(m[3]); mesFim = parseInt(m[5]); anoFim = parseInt(m[6]); break; }
  }

  const blocos: Bloco[] = [];
  let unidade = "";
  let atual: Bloco | null = null;
  let head: Record<string, number> = {};
  const idx = (nome: string) => (head[norm(nome)] ?? -1);

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const a = cell(row[0]);
    const n = filled(row);
    if (n === 0) continue;

    // hospital: linha solitária, depois do preâmbulo (emitido em / título / período)
    if (n === 1 && r >= 3 && !a.startsWith("Total")) { unidade = a; continue; }

    // início do bloco do médico: "Nome - CRM/UF" | CPF
    if (n === 2 && /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cell(row[1]))) {
      const m = a.match(/^(.*?)\s*-\s*([0-9]+)\/([A-Za-z]{2})\s*$/);
      atual = {
        nome: (m ? m[1] : a).trim(), crm: m ? m[2] : "", uf: m ? m[3].toUpperCase() : "",
        cpf: digits(cell(row[1])), unidade, itens: [], checksum: null,
      };
      blocos.push(atual);
      continue;
    }

    if (norm(a) === "data") {
      head = {};
      row.forEach((h, i) => { const k = norm(cell(h)); if (k) head[k] = i; });
      continue;
    }

    if (a.startsWith("Total de") && atual) {
      const alvo = row.map(cell).find((c) => /valor total somado/i.test(c));
      atual.checksum = alvo ? num(alvo.split(":").slice(1).join(":")) : null;
      atual = null;
      continue;
    }

    const data = dataBR(a);
    if (!atual || !data) continue;
    const tipo = cell(row[idx("tipo")]);
    atual.itens.push({
      data,
      hIni: horaDe(cell(row[idx("início plantão")])),
      hFim: horaDe(cell(row[idx("fim plantão")])),
      minutos: durMin(cell(row[idx("duração (h)")])),
      setor: cell(row[idx("setor")]),
      local: cell(row[idx("local")]) || unidade,
      vHora: num(row[idx("valor hora")]),
      valor: num(row[idx("valor estimado")]) || num(row[idx("somatório itens")]),
      tipo,
      aVista: norm(tipo) === "a vista",
    });
  }

  // a soma das linhas tem que bater com o total que o próprio Dr. Escala imprime
  const divergencias = blocos
    .filter((b) => b.checksum !== null && Math.abs(b.itens.reduce((s, i) => s + i.valor, 0) - b.checksum!) > 0.01)
    .map((b) => ({
      medico: b.nome,
      calculado: Number(b.itens.reduce((s, i) => s + i.valor, 0).toFixed(2)),
      relatorio: b.checksum,
    }));

  return { mes, ano, mesFim, anoFim, blocos: blocos.filter((b) => b.itens.length > 0), divergencias };
}

/**
 * Fechamento de radiologia em MATRIZ (Marieta, CEPON) — mesma estrutura nos dois:
 *
 *   Nome | TC | RX | USG | … | Valor TC | Valor RX | Valor USG | … | Acréscimos | Descontos | Total À Pagar
 *          └─ N colunas de quantidade ─┘   └─ N colunas de valor, MESMA ORDEM ─┘
 *
 * O pareamento é POSICIONAL, ancorado em "Acréscimos": entre a 2ª coluna e ela existem
 * 2N colunas, a i-ésima quantidade casa com a (i+N)-ésima de valor. Isso sobrevive aos
 * erros de digitação reais dos cabeçalhos ('URETRO' sem "Valor", 'Valor DRE. BILIAR'
 * para a coluna 'DREN. BILIAR'), que quebrariam um pareamento por nome.
 *
 * Variante só com quantidade (Vila Velha, 21/10): "Nome | RX | Acréscimo | Total À Pagar", cabeçalho na
 * linha 1 e a coluna no singular. Sem coluna de valor por exame, o valor do exame sai do total:
 * Total À Pagar − acréscimos + descontos (com um tipo de exame só, ele leva o valor inteiro).
 */
export function parseMatrizExames(grid: unknown[][], cfg: any) {
  const ehTotal = (h: unknown) => norm(cell(h)) === norm("Total À Pagar");
  // a linha do cabeçalho é a da configuração; se ela não tiver "Total À Pagar", procura nas 10 primeiras
  let hRow = Math.max(1, Number(cfg.header_row) || 2);
  if (!(grid[hRow - 1] || []).some(ehTotal)) {
    const achada = grid.slice(0, 10).findIndex((r) => (r || []).some(ehTotal));
    if (achada >= 0) hRow = achada + 1;
  }
  const headers: string[] = (grid[hRow - 1] || []).map((h) => cell(h));
  const acha = (...nomes: string[]) => headers.findIndex((h) => nomes.some((nome) => norm(h) === norm(nome)));

  const iNome = acha("Nome") >= 0 ? acha("Nome") : 0;
  const iAcre = acha("Acréscimos", "Acréscimo");
  const iDesc = acha("Descontos", "Desconto");
  const iTotal = acha("Total À Pagar");
  if (iAcre < 0 || iTotal < 0) {
    return { erro: "cabeçalho não tem 'Acréscimos'/'Total À Pagar' — confira a aba e a linha do cabeçalho", headers, blocos: [] };
  }

  const largura = iAcre - (iNome + 1);
  if (largura <= 0) {
    return { erro: `nenhuma coluna de exame entre 'Nome' e 'Acréscimos'`, headers, blocos: [] };
  }
  // com "Valor ..." no cabeçalho é a matriz completa (N quantidades + N valores); sem, são só quantidades
  const temValores = headers.slice(iNome + 1, iAcre).some((h) => norm(h).startsWith("valor "));
  if (temValores && largura % 2 !== 0) {
    return { erro: `esperava um nº par de colunas entre 'Nome' e 'Acréscimos' (achei ${largura})`, headers, blocos: [] };
  }
  const n = temValores ? largura / 2 : largura;
  const tipos = Array.from({ length: n }, (_, i) => ({
    nome: headers[iNome + 1 + i] || `Tipo ${i + 1}`,
    iQtd: iNome + 1 + i,
    iVal: temValores ? iNome + 1 + n + i : -1,
  }));

  const blocos: Bloco[] = [];
  for (const row of grid.slice(hRow)) {
    const nome = cell(row[iNome]);
    // rodapés de conferência ("QUANTIDADE DE EXAMES", "TOTAL…") somam as colunas de
    // quantidade sem nenhum valor — sem esse filtro viram um médico fantasma.
    if (!nome || /^total/i.test(nome) || /quantidade de exames|^soma\b|^geral\b/i.test(norm(nome))) continue;

    const acrescimos = iAcre >= 0 ? num(row[iAcre]) : 0;
    const descontos = iDesc >= 0 ? num(row[iDesc]) : 0;
    const total = num(row[iTotal]);
    // só quantidades: a produção é o total sem acréscimos e descontos
    const producaoSemValor = Number((total - acrescimos + Math.abs(descontos)).toFixed(2));

    const itens: Item[] = [];
    for (const t of tipos) {
      const qtd = num(row[t.iQtd]);
      const valor = t.iVal >= 0 ? num(row[t.iVal]) : (tipos.length === 1 ? producaoSemValor : 0);
      if (!qtd && !valor) continue;
      itens.push({
        ...itemVazio(), local: cfg.nome, tipo: t.nome,
        descricao: t.nome, quantidade: qtd,
        valorUnitario: qtd ? Number((valor / qtd).toFixed(4)) : 0,
        valor,
      });
    }
    // vários exames sem valor por exame: o valor entra numa linha só de produção
    if (!temValores && tipos.length > 1 && producaoSemValor) {
      itens.push({ ...itemVazio(), local: cfg.nome, descricao: "Produção do mês", valor: producaoSemValor });
    }
    // só vira lançamento quem tem dinheiro na linha. Quantidade sozinha (sem nenhum
    // valor) é linha de conferência, não pagamento.
    const temValor = itens.some((i) => i.valor !== 0);
    if (!temValor && !acrescimos && !descontos && !total) continue;

    blocos.push({ nome, crm: "", uf: "", cpf: "", unidade: cfg.nome, itens, checksum: total, acrescimos, descontos });
  }

  // o "Total À Pagar" da planilha é o checksum: produção + acréscimos - descontos
  const divergencias = blocos
    .filter((b) => {
      const calc = b.itens.reduce((s, i) => s + i.valor, 0) + (b.acrescimos || 0) - Math.abs(b.descontos || 0);
      return Math.abs(calc - (b.checksum || 0)) > 0.01;
    })
    .map((b) => ({
      medico: b.nome,
      calculado: Number((b.itens.reduce((s, i) => s + i.valor, 0) + (b.acrescimos || 0) - Math.abs(b.descontos || 0)).toFixed(2)),
      relatorio: b.checksum,
    }));

  return { blocos, divergencias };
}

/**
 * Aba "RESUMO MÉDICO" do fechamento Carestream — blocos por médico:
 *
 *   <Nome do médico>
 *   Exame Realizado | Quant. Carestream | Vlr. Uni. | Valor Total
 *   Tomografia      | 97                | 34,65     | 3.361,05
 *   …
 *   Total           | 281               |           | 15.248,62      ← checksum
 *
 * Este é o lado A RECEBER: mesma quantidade de exames da planilha de pagamento, mas
 * ao preço do contrato com o cliente (TC a 34,65 aqui × 20,63 que se paga ao médico).
 */
export function parseCarestreamResumo(grid: unknown[][]) {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  let cols: { tipo: number; qtd: number; uni: number; total: number } | null = null;

  for (const row of grid) {
    const vals = row.map(cell);
    const preenchidos = vals.filter((v) => v !== "").length;
    if (!preenchidos) { atual = null; cols = null; continue; }

    // cabeçalho do bloco
    const iTipo = vals.findIndex((v) => norm(v) === "exame realizado");
    if (iTipo >= 0) {
      cols = {
        tipo: iTipo,
        qtd: vals.findIndex((v) => norm(v).startsWith("quant")),
        uni: vals.findIndex((v) => norm(v).startsWith("vlr")),
        total: vals.findIndex((v) => norm(v) === "valor total"),
      };
      continue;
    }

    // linha só com o nome = início de bloco. NÃO condicionar a `cols` estar limpo:
    // quando não há linha em branco entre dois médicos, as linhas do seguinte
    // acabariam somadas no anterior.
    if (preenchidos === 1) {
      const nome = vals.find((v) => v !== "")!;
      if (/^total/i.test(nome) || num(nome)) continue;
      atual = { nome: nome.trim(), crm: "", uf: "", cpf: "", unidade: "", itens: [], checksum: null };
      cols = null;
      blocos.push(atual);
      continue;
    }
    if (!atual || !cols) continue;

    const rotulo = cell(row[cols.tipo]);
    if (!rotulo) continue;
    if (/^total$/i.test(rotulo)) { atual.checksum = num(row[cols.total]); atual = null; cols = null; continue; }

    const qtd = num(row[cols.qtd]);
    const valor = num(row[cols.total]);
    if (!qtd && !valor) continue;
    atual.itens.push({
      ...itemVazio(), tipo: rotulo, descricao: rotulo,
      quantidade: qtd, valorUnitario: num(row[cols.uni]), valor,
    });
  }

  const divergencias = blocos
    .filter((b) => b.checksum !== null && Math.abs(b.itens.reduce((s, i) => s + i.valor, 0) - b.checksum!) > 0.01)
    .map((b) => ({
      medico: b.nome,
      calculado: Number(b.itens.reduce((s, i) => s + i.valor, 0).toFixed(2)),
      relatorio: b.checksum,
    }));

  return { blocos: blocos.filter((b) => b.itens.length > 0), divergencias };
}

/**
 * Relatório CONSOLIDADO do Dr. Escala — uma linha por médico, que é como a equipe
 * trabalha. Mesmo preâmbulo do Completo (período na linha 3, unidade na linha 4):
 *
 *   Profissional | Qtde de Plantões | Qtde de Horas (h) | [À Vista] | [Coordenação] | Valor Total
 *
 * As colunas entre colchetes são acrescentadas À MÃO pela equipe na planilha baixada —
 * o "À Vista" é o que o médico já recebeu e a "Coordenação" um acréscimo. Se estiverem
 * presentes, entram como parcela já paga e como ajuste. Se não, o import segue igual.
 */
export function parseDrEscalaConsolidado(grid: unknown[][], gridFmt?: unknown[][]) {
  // período pode cruzar dois meses (21/08 a 20/09 = competência de setembro): guarda início e fim
  let mes = 0, ano = 0, mesFim = 0, anoFim = 0;
  for (const row of grid.slice(0, 10)) {
    const m = cell(row[0]).match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { mes = parseInt(m[2]); ano = parseInt(m[3]); mesFim = parseInt(m[5]); anoFim = parseInt(m[6]); break; }
  }

  let hRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (norm(cell((grid[r] || [])[0])).startsWith("profissional")) { hRow = r; break; }
  }
  if (hRow < 0) return { mes, ano, mesFim, anoFim, blocos: [], erro: "não achei a linha de cabeçalho ('Profissional') no arquivo" };

  const headers = (grid[hRow] || []).map((h) => cell(h));
  const acha = (...nomes: string[]) =>
    headers.findIndex((h) => nomes.some((n) => norm(h).startsWith(norm(n))));
  const iNome = 0;
  const iPlantoes = acha("Qtde de Plantões", "Plantões", "Qtde Plantões");
  const iHoras = acha("Qtde de Horas", "Horas");
  const iAVista = acha("À Vista", "A Vista");
  const iCoord = acha("Coordenação", "Coordenacao");
  const iTotal = acha("Valor Total", "Total");
  // Locais de consulta não têm plantão nem hora: a quantidade vem em outras colunas, "Qtde de Itens"
  // (Cruzália, Pomerode, Antônio Dias) ou uma por tipo, "Consultas | Cirurgias Uni | ..." (Taió).
  // Sem ler essas colunas o pedido de nota saía "referente a atividades" (Mavi, 21/10).
  const usadas = new Set([iNome, iPlantoes, iHoras, iAVista, iCoord, iTotal]);
  const colsQtd = headers
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(({ h, i }) => h && !/^valor/i.test(h) && !usadas.has(i) && (iTotal < 0 || i < iTotal));

  const unidade = cell((grid[Math.max(0, hRow - 1)] || [])[0]);

  const blocos: Bloco[] = [];
  for (const row of grid.slice(hRow + 1)) {
    const nome = cell(row[iNome]);
    if (!nome || /^total/i.test(nome)) continue;
    const valor = iTotal >= 0 ? num(row[iTotal]) : 0;
    const aVista = iAVista >= 0 ? num(row[iAVista]) : 0;
    const coord = iCoord >= 0 ? num(row[iCoord]) : 0;
    if (!valor && !aVista && !coord) continue;

    // Horas: duração do Excel chega como número em DIAS no grid cru (6,7 = 160h59).
    // O grid formatado traz "160:59:00", que é inequívoco — mas nele o dinheiro vem
    // em padrão americano (" R$ 27,120.00 "), então cada coisa vem de onde é confiável.
    const linhaFmt = gridFmt?.[grid.indexOf(row)] as unknown[] | undefined;
    const minutos = iHoras >= 0
      ? horasEmMinutos(linhaFmt?.[iHoras] ?? row[iHoras])
      : 0;
    const plantoes = iPlantoes >= 0 ? Math.round(num(row[iPlantoes])) : 0;
    const qtds = colsQtd
      .map(({ h, i }) => ({ h, n: Math.round(num(row[i])) }))
      .filter((q) => q.n > 0);
    const qtdItens = qtds.reduce((t, q) => t + q.n, 0);
    // um tipo só ("17 Consultas") vai com o nome da coluna; misturado vira "N item(ns)", porque o
    // pedido de nota chamaria tudo de consulta se a descrição mencionasse "Consultas"
    const descQtd = qtds.length === 1 && !/^qtde? de itens$|^itens$/i.test(qtds[0].h)
      ? `${qtds[0].n} ${qtds[0].h}` : `${qtdItens} item(ns)`;
    // "Valor Total" da planilha dela JÁ inclui a coordenação; a produção é o que sobra.
    // 22/09 (Braço do Norte/agosto): quando o médico recebeu TUDO à vista, a equipe
    // preenche só a coluna "À Vista" e deixa "Valor Total" em branco. À vista é forma de
    // pagamento, não um valor à parte — sem o max() a produção ficava 0 e o a pagar
    // virava NEGATIVO (−9.600 do Lauro), derrubando o total da competência.
    const producao = Math.max(valor - coord, aVista);

    blocos.push({
      nome, crm: "", uf: "", cpf: "", unidade, checksum: valor,
      acrescimos: coord, descontos: 0,
      // um item sintético carrega a produção do mês; o consolidado não tem grão de plantão
      itens: [{
        ...itemVazio(), local: unidade, minutos, valor: producao,
        descricao: plantoes ? `${plantoes} plantão(ões)` : qtdItens ? descQtd : "Produção do mês",
        quantidade: plantoes || qtdItens || undefined,
      }],
      aVistaValor: aVista,
      // sem detalhe de plantão não dá para saber QUAIS horas foram à vista; estima na
      // proporção do valor e deixa a equipe corrigir na tela.
      aVistaMinutos: aVista && producao ? Math.round(minutos * (aVista / producao)) : 0,
      plantoes,
    } as Bloco);
  }
  return { mes, ano, mesFim, anoFim, blocos, divergencias: [] };
}

/**
 * Lista de exames por profissional (radiologia de Santo Antônio do Pinhal, 22/10):
 *
 *   PROFISSIONAL: YURI FRANCO GUIMARÃES        ← ou o nome sozinho na linha
 *   EXAME         | VALOR | QTDE. | TOTAL
 *   ABD. SUPERIOR | 60    | 6     | 360
 *   …
 *   TOTAL         |       |       | 12.780     ← checksum
 *
 * Exame sem quantidade fica de fora. Linha solta depois do TOTAL ("BRUTO NF R$ …") é ignorada:
 * o valor da nota não entra no fechamento, o médico recebe o total dos exames (Mavi, 22/10).
 */
export function parseListaExames(grid: unknown[][]) {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  let cols: { tipo: number; qtd: number; uni: number; total: number } | null = null;

  for (const row of grid) {
    const vals = (row || []).map(cell);
    const preenchidos = vals.filter((v) => v !== "");
    if (!preenchidos.length) continue;

    const iTipo = vals.findIndex((v) => norm(v).startsWith("exame"));
    const iQtd = vals.findIndex((v) => /^(qtde?|quant)/.test(norm(v)));
    if (iTipo >= 0 && iQtd >= 0) {
      cols = {
        tipo: iTipo, qtd: iQtd,
        uni: vals.findIndex((v) => /^(valor|vlr)/.test(norm(v)) && !norm(v).includes("total")),
        total: vals.findIndex((v) => norm(v).includes("total")),
      };
      continue;
    }

    // linha de uma célula só: nome do profissional (com ou sem "PROFISSIONAL:") abre um bloco novo
    if (preenchidos.length === 1) {
      const t = preenchidos[0];
      if (/^bruto/.test(norm(t))) { atual = null; cols = null; continue; }
      if (/^total/i.test(t) || num(t)) continue;
      atual = { nome: t.replace(/^\s*profissional\s*:\s*/i, "").trim(), crm: "", uf: "", cpf: "", unidade: "", itens: [], checksum: null };
      cols = null;
      blocos.push(atual);
      continue;
    }
    if (!atual || !cols) continue;

    const rotulo = vals[cols.tipo];
    if (/^total/i.test(rotulo)) { atual.checksum = cols.total >= 0 ? num(row[cols.total]) : null; atual = null; cols = null; continue; }
    const qtd = num(row[cols.qtd]);
    const uni = cols.uni >= 0 ? num(row[cols.uni]) : 0;
    const valor = (cols.total >= 0 ? num(row[cols.total]) : 0) || r2v(qtd * uni);
    if (!qtd && !valor) continue;
    atual.itens.push({ ...itemVazio(), tipo: rotulo, descricao: rotulo, quantidade: qtd, valorUnitario: uni, valor });
  }

  const soma = (b: Bloco) => b.itens.reduce((t, i) => t + i.valor, 0);
  const divergencias = blocos
    .filter((b) => b.itens.length && b.checksum !== null && Math.abs(soma(b) - b.checksum!) > 0.01)
    .map((b) => ({ medico: b.nome, calculado: Number(soma(b).toFixed(2)), relatorio: b.checksum }));
  return { blocos: blocos.filter((b) => b.itens.length > 0), divergencias };
}
const r2v = (n: number) => Math.round(n * 100) / 100;

/**
 * Tabelas lado a lado por tipo de atendimento (CIS Navegantes, 23/10):
 *
 *   CONSULTAS/HORAS                         | PROCEDIMENTOS                 | COLONOS
 *   Profissional | Quantidade | Valor | À pagar | Profissional | Quantidade | ...
 *   Dermatologia - Lilian Viana | 108 | 60 | 6480 | Dermatologia - Lilian Viana | 57 | 75 | 4275
 *   Anestesiologia - Vanessa ... por hora | 12 | 166,67 | 2000,04
 *
 * O mesmo médico aparece em mais de uma tabela: vira um lançamento só, com um item por tipo, para a
 * mensagem de nota dizer quantas consultas, procedimentos e colonoscopias ele fez. "por hora" no nome
 * vira horas. Linha sem o nome do médico ("Urologia - ") não tem a quem pagar: sai como aviso.
 */
export function parseTabelasPorTipo(grid: unknown[][]) {
  let hRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if ((grid[r] || []).filter((v) => norm(cell(v)).startsWith("profissional")).length >= 1) { hRow = r; break; }
  }
  if (hRow < 0) return { blocos: [], avisos: [], erro: "não achei a linha de cabeçalho ('Profissional') no arquivo" };
  const head = (grid[hRow] || []).map((v) => norm(cell(v)));
  const grupos = head.map((h, i) => (h.startsWith("profissional") ? i : -1)).filter((i) => i >= 0).map((ci) => {
    const titulo = norm(cell((grid[hRow - 1] || [])[ci]));
    const tipo = titulo.startsWith("colono") ? "colonoscopias" : titulo.startsWith("proced") ? "procedimentos" : "consultas";
    const depois = (pred: (h: string) => boolean) => { for (let i = ci + 1; i < ci + 6 && i < head.length; i++) if (pred(head[i])) return i; return -1; };
    return { ci, tipo, iQtd: depois((h) => h.startsWith("quant")), iUni: depois((h) => h.startsWith("valor")), iTot: depois((h) => h.includes("pagar")) };
  });

  type Linha = { esp: string; nome: string; tipo: string; qtd: number; uni: number; valor: number; horas: boolean };
  const linhas: Linha[] = [];
  const avisos: { linha: string; valor: number; motivo: string }[] = [];
  for (const row of grid.slice(hRow + 1)) {
    for (const g of grupos) {
      const rotulo = cell((row || [])[g.ci]);
      if (!rotulo || /^total/i.test(rotulo)) continue;
      const qtd = g.iQtd >= 0 ? num(row[g.iQtd]) : 0;
      const uni = g.iUni >= 0 ? num(row[g.iUni]) : 0;
      const valor = (g.iTot >= 0 ? num(row[g.iTot]) : 0) || Math.round(qtd * uni * 100) / 100;
      if (!valor) continue;
      // "Especialidade - Nome", às vezes sem espaço antes do traço ("Endocrinologia- Felipe Capri")
      const m = rotulo.match(/^([^-]*?)\s*-\s*(.*)$/);
      const esp = m ? m[1] : rotulo;
      const bruto = m ? m[2] : "";
      const horas = /por hora\s*$/i.test(bruto);
      const nome = bruto.replace(/por hora\s*$/i, "").trim();
      if (!nome) { avisos.push({ linha: rotulo, valor, motivo: "linha sem o nome do médico: não importada" }); continue; }
      linhas.push({ esp: esp.trim(), nome, tipo: g.tipo, qtd, uni, valor, horas });
    }
  }

  // mesmo médico em mais de uma tabela: mesmo nome, ou nome curto que é o começo do longo na mesma
  // especialidade ("Proctologia - Bruno Felipe" e "Proctologia - Bruno Felipe Carvalho")
  const toks = (s: string) => norm(s).split(" ").filter(Boolean);
  const nomes = [...new Set(linhas.map((l) => norm(l.nome)))];
  const canon = new Map<string, string>();
  for (const l of linhas) {
    const t = toks(l.nome);
    const maiores = nomes.filter((n) => n !== norm(l.nome) && t.every((w, i) => toks(n)[i] === w)
      && linhas.some((x) => norm(x.nome) === n && x.esp === l.esp));
    canon.set(norm(l.nome), maiores.length === 1 ? maiores[0] : norm(l.nome));
  }
  const blocos = new Map<string, Bloco>();
  for (const l of linhas) {
    const k = canon.get(norm(l.nome))!;
    const nomeBloco = linhas.find((x) => norm(x.nome) === k)?.nome ?? l.nome;
    if (!blocos.has(k)) blocos.set(k, { nome: nomeBloco, crm: "", uf: "", cpf: "", unidade: "", itens: [], checksum: null });
    blocos.get(k)!.itens.push({
      ...itemVazio(), setor: l.esp, valor: l.valor, valorUnitario: l.uni,
      ...(l.horas
        ? { minutos: Math.round(l.qtd * 60), descricao: `${l.qtd} horas` }
        : { tipo: l.tipo, descricao: l.tipo, quantidade: l.qtd }),
    });
  }
  return { blocos: [...blocos.values()], avisos };
}

/** Genérico: tabela plana guiada por mapa_colunas (Marieta, CIS…). */
export function parseGenerico(grid: unknown[][], cfg: any) {
  const hRow = Math.max(1, Number(cfg.header_row) || 1);
  const headers: string[] = (grid[hRow - 1] || []).map((h) => cell(h));
  const colIdx = (nome: string): number => {
    if (!nome) return -1;
    let i = headers.findIndex((h) => h === nome);
    if (i === -1) i = headers.findIndex((h) => norm(h) === norm(nome));
    return i;
  };
  const mapa = cfg.mapa_colunas || {};
  const iMedico = colIdx(mapa.medico), iCrm = colIdx(mapa.crm);
  const iQtd = colIdx(mapa.quantidade), iValor = colIdx(mapa.valor);
  const colsValor: number[] = Array.isArray(mapa.colunas_valor)
    ? mapa.colunas_valor.map((c: string) => colIdx(c)).filter((x: number) => x >= 0) : [];
  if (iMedico < 0) return { erro: `coluna do médico ('${mapa.medico}') não encontrada no cabeçalho`, headers, blocos: [] };

  const blocos: Bloco[] = [];
  for (const row of grid.slice(hRow)) {
    const nome = cell(row[iMedico]);
    if (!nome || /^total/i.test(nome)) continue;
    const valor = cfg.layout === "matriz"
      ? colsValor.reduce((s, c) => s + num(row[c]), 0)
      : (iValor >= 0 ? num(row[iValor]) : 0);
    const qtd = iQtd >= 0 ? num(row[iQtd]) : 0;
    if (valor === 0 && qtd === 0) continue;
    blocos.push({
      nome, crm: iCrm >= 0 ? cell(row[iCrm]) : "", uf: "", cpf: "", unidade: cfg.nome, checksum: null,
      // sem grão de plantão: item sintético só pra carregar valor e quantidade
      itens: [{ data: "", hIni: "", hFim: "", minutos: Math.round(qtd * 60), setor: "", local: cfg.nome, vHora: 0, valor, tipo: "", aVista: false }],
    });
  }
  return { blocos };
}
