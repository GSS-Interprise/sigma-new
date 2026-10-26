import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (s?: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

export interface FechamentoPdfLancamento {
  profissional_nome?: string | null;
  profissional_crm?: string | null;
  unidade?: string | null;
  total_plantoes?: number | null;
  valor_total?: number | null;
  medico_id?: string | null;
  // quando a nota e o lançamento já existem (aprovação depois da nota)
  nf_status?: string | null;
  nf_numero?: string | null;
  nf_valor_liquido?: number | null;
  fornecedor?: string | null;          // razão social da PJ do médico (financeiro_medico_cnpj.razao)
  data_vencimento?: string | null;
  ca_vencimento?: string | null;
  data_pagamento?: string | null;
  ca_baixa_em?: string | null;
  status?: string | null;
}

/**
 * Relatório de aprovação para o Dr. João no formato do "Relatório de Contas a Pagar" do Conta Azul,
 * que a Mavi já mandava (exemplo de 14/10/2026: EX.- SÃO CARLOS REF. MAIO): indicadores do período
 * (vencidos, vencem hoje, a vencer, pagos, total), e por lançamento vencimento, pagamento, descrição
 * "REF. MÊS - NF nº", fornecedor, categoria MED. da unidade, valor, em aberto e situação.
 * Agrupa por categoria (unidade) com subtotal, já que o Sigma manda o mês inteiro de uma vez.
 * Retorna um Blob pronto pra subir no cofre privado (financeiro-anexos).
 */
export function gerarFechamentoPdf(mes: number, ano: number, lancamentos: FechamentoPdfLancamento[], total: number): Blob {
  const doc = new jsPDF({ orientation: "landscape" });
  const hoje = format(new Date(), "yyyy-MM-dd");
  const ref = (MESES[mes - 1] ?? String(mes)).toUpperCase();

  const linhas = lancamentos.map((p) => {
    const valor = Number(p.nf_valor_liquido ?? p.valor_total ?? 0);
    const bruto = Number(p.valor_total ?? 0);
    // nota recebida sem o número lido não é "pendente" (Isabela e Nelson, agosto, 26/10)
    const temNota = ["recebida", "conferida"].includes(p.nf_status ?? "") || !!p.nf_numero;
    const nf = p.nf_numero ? `NF ${p.nf_numero}` : temNota ? "NF recebida" : "NF pendente";
    const venc = p.ca_vencimento || p.data_vencimento || null;
    const pago = !!(p.data_pagamento || p.ca_baixa_em || p.status === "pago");
    return {
      venc, pag: p.data_pagamento || (p.ca_baixa_em ? p.ca_baixa_em.slice(0, 10) : null), pago, valor, bruto,
      descricao: `REF. ${ref} - ${nf}`,
      fornecedor: (p.fornecedor || p.profissional_nome || "-").toUpperCase(),
      categoria: `MED. ${(p.unidade || "SEM UNIDADE").toUpperCase()}`,
      emAberto: pago ? 0 : valor,
    };
  });

  const soma = (f: (l: typeof linhas[number]) => boolean) => linhas.filter(f).reduce((a, l) => a + l.valor, 0);
  const vencidos = soma((l) => !l.pago && !!l.venc && l.venc.slice(0, 10) < hoje);
  const vencemHoje = soma((l) => !l.pago && !!l.venc && l.venc.slice(0, 10) === hoje);
  const aVencer = soma((l) => !l.pago && (!l.venc || l.venc.slice(0, 10) > hoje));
  const pagos = soma((l) => l.pago);
  const totalPeriodo = linhas.length ? linhas.reduce((a, l) => a + l.valor, 0) : total;

  // cabeçalho
  doc.setFontSize(15); doc.setTextColor(23, 96, 41);
  doc.text("Relatório de Contas a Pagar", 14, 16);
  doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text("GSS - GESTAO SERVICOS A SAUDE LTDA · CNPJ 18.670.594/0001-03 · Avenida Osvaldo Reis, 2470", 14, 22);
  doc.text(`Competência: ${MESES[mes - 1] ?? mes}/${ano} · Gerado pelo Sigma em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 27);
  // O card do fechamento mostra o bruto das notas; aqui os valores são o líquido pago ao médico.
  // A diferença são os impostos retidos que a GSS recolhe (Mavi, 26/10: "o total fica divergente").
  const totalBruto = linhas.reduce((a, l) => a + l.bruto, 0);
  doc.text(`Bruto das notas: R$ ${brl(totalBruto)} · Impostos retidos: R$ ${brl(totalBruto - linhas.reduce((a, l) => a + l.valor, 0))} · `
    + `Líquido a pagar aos médicos: R$ ${brl(linhas.reduce((a, l) => a + l.valor, 0))}`, 14, 32);

  // indicadores
  const cards: Array<[string, number]> = [["Vencidos (R$)", vencidos], ["Vencem hoje (R$)", vencemHoje], ["A vencer (R$)", aVencer], ["Pagos (R$)", pagos], ["Líquido do período (R$)", totalPeriodo]];
  const largura = (297 - 28 - 4 * 4) / 5;
  cards.forEach(([rot, v], i) => {
    const x = 14 + i * (largura + 4);
    doc.setFillColor(234, 243, 232); doc.roundedRect(x, 36, largura, 15, 2, 2, "F");
    doc.setFontSize(8); doc.setTextColor(90, 90, 90); doc.text(rot, x + 3, 41);
    doc.setFontSize(12); doc.setTextColor(23, 96, 41); doc.text(brl(v), x + 3, 48);
  });
  doc.setTextColor(0, 0, 0);

  // tabela agrupada por categoria (unidade), com subtotal
  const porCategoria = new Map<string, typeof linhas>();
  for (const l of linhas.slice().sort((a, b) => a.categoria.localeCompare(b.categoria) || a.fornecedor.localeCompare(b.fornecedor))) {
    if (!porCategoria.has(l.categoria)) porCategoria.set(l.categoria, []);
    porCategoria.get(l.categoria)!.push(l);
  }
  const body: any[] = [];
  for (const [cat, itens] of porCategoria) {
    for (const l of itens) {
      body.push([dataBr(l.venc), dataBr(l.pag), l.descricao, l.fornecedor, cat, brl(l.valor), brl(l.emAberto), l.pago ? "Pago" : l.venc && l.venc.slice(0, 10) < hoje ? "Vencido" : "Em aberto"]);
    }
    if (porCategoria.size > 1) {
      body.push([{ content: `Subtotal ${cat}`, colSpan: 5, styles: { fontStyle: "bold", halign: "right" } },
        { content: brl(itens.reduce((a, l) => a + l.valor, 0)), styles: { fontStyle: "bold", halign: "right" } },
        { content: brl(itens.reduce((a, l) => a + l.emAberto, 0)), styles: { fontStyle: "bold", halign: "right" } }, ""]);
    }
  }

  autoTable(doc, {
    head: [["Vencimento", "Pagamento", "Descrição", "Fornecedor", "Categoria", "Valor líquido (R$)", "Em aberto (R$)", "Situação"]],
    body,
    foot: [["", "", "", "", `Totais do período · ${linhas.length} registro(s)`,
      { content: brl(totalPeriodo), styles: { halign: "right" } },
      { content: brl(linhas.reduce((a, l) => a + l.emAberto, 0)), styles: { halign: "right" } }, ""]],
    startY: 56,
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [23, 96, 41] },       // verde GSS
    footStyles: { fillColor: [234, 243, 232], textColor: [23, 96, 41], fontStyle: "bold" },
    columnStyles: { 5: { halign: "right" }, 6: { halign: "right" }, 3: { cellWidth: 62 }, 2: { cellWidth: 45 } },
  });

  return doc.output("blob");
}
