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
export const padraoSemAcento = (s: string) =>
  nomeLimpo(s).replace(/[^A-Za-z0-9 .,'-]/g, "_");
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
  let mes = 0, ano = 0;
  for (const row of grid.slice(0, 10)) {
    const m = cell(row[0]).match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { mes = parseInt(m[2]); ano = parseInt(m[3]); break; }
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

  return { mes, ano, blocos: blocos.filter((b) => b.itens.length > 0), divergencias };
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
 */
export function parseMatrizExames(grid: unknown[][], cfg: any) {
  const hRow = Math.max(1, Number(cfg.header_row) || 2);
  const headers: string[] = (grid[hRow - 1] || []).map((h) => cell(h));
  const acha = (nome: string) => headers.findIndex((h) => norm(h) === norm(nome));

  const iNome = acha("Nome") >= 0 ? acha("Nome") : 0;
  const iAcre = acha("Acréscimos");
  const iDesc = acha("Descontos");
  const iTotal = acha("Total À Pagar");
  if (iAcre < 0 || iTotal < 0) {
    return { erro: "cabeçalho não tem 'Acréscimos'/'Total À Pagar' — confira a aba e a linha do cabeçalho", headers, blocos: [] };
  }

  const largura = iAcre - (iNome + 1);
  if (largura <= 0 || largura % 2 !== 0) {
    return { erro: `esperava um nº par de colunas entre 'Nome' e 'Acréscimos' (achei ${largura})`, headers, blocos: [] };
  }
  const n = largura / 2;
  const tipos = Array.from({ length: n }, (_, i) => ({
    nome: headers[iNome + 1 + i] || `Tipo ${i + 1}`,
    iQtd: iNome + 1 + i,
    iVal: iNome + 1 + n + i,
  }));

  const blocos: Bloco[] = [];
  for (const row of grid.slice(hRow)) {
    const nome = cell(row[iNome]);
    // rodapés de conferência ("QUANTIDADE DE EXAMES", "TOTAL…") somam as colunas de
    // quantidade sem nenhum valor — sem esse filtro viram um médico fantasma.
    if (!nome || /^total/i.test(nome) || /quantidade de exames|^soma\b|^geral\b/i.test(norm(nome))) continue;

    const itens: Item[] = [];
    for (const t of tipos) {
      const qtd = num(row[t.iQtd]);
      const valor = num(row[t.iVal]);
      if (!qtd && !valor) continue;
      itens.push({
        ...itemVazio(), local: cfg.nome, tipo: t.nome,
        descricao: t.nome, quantidade: qtd,
        valorUnitario: qtd ? Number((valor / qtd).toFixed(4)) : 0,
        valor,
      });
    }
    const acrescimos = iAcre >= 0 ? num(row[iAcre]) : 0;
    const descontos = iDesc >= 0 ? num(row[iDesc]) : 0;
    const total = num(row[iTotal]);
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
  let mes = 0, ano = 0;
  for (const row of grid.slice(0, 10)) {
    const m = cell(row[0]).match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) { mes = parseInt(m[2]); ano = parseInt(m[3]); break; }
  }

  let hRow = -1;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    if (norm(cell((grid[r] || [])[0])).startsWith("profissional")) { hRow = r; break; }
  }
  if (hRow < 0) return { mes, ano, blocos: [], erro: "não achei a linha de cabeçalho ('Profissional') no arquivo" };

  const headers = (grid[hRow] || []).map((h) => cell(h));
  const acha = (...nomes: string[]) =>
    headers.findIndex((h) => nomes.some((n) => norm(h).startsWith(norm(n))));
  const iNome = 0;
  const iPlantoes = acha("Qtde de Plantões", "Plantões", "Qtde Plantões");
  const iHoras = acha("Qtde de Horas", "Horas");
  const iAVista = acha("À Vista", "A Vista");
  const iCoord = acha("Coordenação", "Coordenacao");
  const iTotal = acha("Valor Total", "Total");

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
    // "Valor Total" da planilha dela JÁ inclui a coordenação; a produção é o que sobra
    const producao = valor - coord;

    blocos.push({
      nome, crm: "", uf: "", cpf: "", unidade, checksum: valor,
      acrescimos: coord, descontos: 0,
      // um item sintético carrega a produção do mês; o consolidado não tem grão de plantão
      itens: [{
        ...itemVazio(), local: unidade, minutos, valor: producao,
        descricao: plantoes ? `${plantoes} plantão(ões)` : "Produção do mês",
        quantidade: plantoes || undefined,
      }],
      aVistaValor: aVista,
      // sem detalhe de plantão não dá para saber QUAIS horas foram à vista; estima na
      // proporção do valor e deixa a equipe corrigir na tela.
      aVistaMinutos: aVista && producao ? Math.round(minutos * (aVista / producao)) : 0,
      plantoes,
    } as Bloco);
  }
  return { mes, ano, blocos, divergencias: [] };
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
