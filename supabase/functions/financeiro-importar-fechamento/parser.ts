// Parsers do import de fechamento. Separado do index.ts pra poder rodar sozinho
// (ver _test_parser.ts) — parse de dinheiro/hora é onde erro passa despercebido.

export const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const digits = (s: string) => (s || "").replace(/[^0-9]/g, "");
export const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const filled = (row: unknown[]) => row.filter((v) => cell(v) !== "").length;

// aceita "R$ 57.500,00", "1200", "2.280,50" (nbsp incluso)
export function num(v: unknown): number {
  const raw = cell(v).replace(/ /g, " ");
  if (!raw || raw === "-") return 0;
  const t = raw.replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
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
    if (!nome || /^total/i.test(nome)) continue;

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
    // médico sem produção e sem ajuste no mês não vira lançamento
    if (!itens.length && !acrescimos && !descontos && !total) continue;

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
