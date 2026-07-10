import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface FechamentoPdfLancamento {
  profissional_nome?: string | null;
  profissional_crm?: string | null;
  unidade?: string | null;
  total_plantoes?: number | null;
  valor_total?: number | null;
  medico_id?: string | null;
}

// Gera o PDF do fechamento (lançamento por médico) pra a diretoria conferir antes de
// aprovar. Retorna um Blob pronto pra subir no cofre privado (financeiro-anexos).
export function gerarFechamentoPdf(mes: number, ano: number, lancamentos: FechamentoPdfLancamento[], total: number): Blob {
  const doc = new jsPDF();
  const medicos = new Set(lancamentos.map((p) => p.medico_id || p.profissional_crm || p.profissional_nome || ""));

  doc.setFontSize(16);
  doc.text("Fechamento Financeiro — GSS Saúde", 14, 20);
  doc.setFontSize(12);
  doc.text(`Competência: ${MESES[mes - 1] ?? mes}/${ano}`, 14, 29);
  doc.setFontSize(10);
  doc.setTextColor(90, 112, 90);
  doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 35);
  doc.text(`Total: ${brl(total)}  ·  ${medicos.size} médico(s)  ·  ${lancamentos.length} lançamento(s)`, 14, 41);
  doc.setTextColor(0, 0, 0);

  const body = lancamentos
    .slice()
    .sort((a, b) => (a.profissional_nome || "").localeCompare(b.profissional_nome || ""))
    .map((p) => [
      p.profissional_nome || "-",
      p.profissional_crm || "-",
      p.unidade || "-",
      String(p.total_plantoes ?? 0),
      brl(Number(p.valor_total)),
    ]);

  autoTable(doc, {
    head: [["Médico", "CRM", "Unidade", "Plantões", "Valor"]],
    body,
    foot: [["", "", "", "Total", brl(total)]],
    startY: 47,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [23, 96, 41] },       // verde GSS
    footStyles: { fillColor: [234, 243, 232], textColor: [23, 96, 41], fontStyle: "bold" },
    columnStyles: { 3: { halign: "center" }, 4: { halign: "right" } },
  });

  return doc.output("blob");
}
