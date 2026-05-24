import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * F3.3 — Export real de PDF/Excel do Dashboard de Prospecção.
 *
 * Client-side via jspdf + jspdf-autotable (PDF) e xlsx (Excel).
 * Sem dependência de edge function — funciona offline, sem latência,
 * sem custo extra. Puppeteer no Supabase Edge exigiria serviço externo
 * (browserless), tradeoff que não vale pra dashboard simples.
 */

export interface DashboardExportData {
  agg: {
    campanhas: number;
    pool_total: number;
    contatado: number;
    em_conversa: number;
    quentes: number;
    convertidos: number;
    disparos_24h: number;
    disparos_7d: number;
  };
  coberturaPct: number;
  conversionPct: number;
  responseRatePct: number;
  tempoMedioQuente: number | null;
  descartadosPhone: number;
  rows: Array<{
    nome: string;
    status: string;
    regiao_estado: string | null;
    pool_total: number | null;
    contatado: number | null;
    em_conversa: number | null;
    quentes: number | null;
    convertidos: number | null;
    disparos_24h: number | null;
    quente_mais_antigo_h: number | null;
  }>;
  filtros: {
    campanha?: string;
    estado?: string;
    especialidade?: string;
  };
}

const GSS_GREEN = "#1a5a2a";
const GSS_GREEN_LIGHT = "#2d7d3f";

function nomeArquivo(formato: "pdf" | "xlsx") {
  const data = format(new Date(), "yyyy-MM-dd_HHmm", { locale: ptBR });
  return `dashboard-prospeccao_${data}.${formato}`;
}

function dataHumana() {
  return format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function exportarDashboardPDF(d: DashboardExportData) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  // Header verde GSS
  doc.setFillColor(GSS_GREEN);
  doc.rect(0, 0, pageW, 24, "F");
  doc.setTextColor("#ffffff");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("GSS", margin, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Gestão Serviços Saúde · Dashboard de Prospecção", margin, 19);

  doc.setFontSize(9);
  doc.text(`Gerado em ${dataHumana()}`, pageW - margin, 19, { align: "right" });

  y = 32;

  // Filtros aplicados
  const filtrosTexto: string[] = [];
  if (d.filtros.campanha) filtrosTexto.push(`Campanha: ${d.filtros.campanha}`);
  if (d.filtros.estado) filtrosTexto.push(`Estado: ${d.filtros.estado}`);
  if (d.filtros.especialidade)
    filtrosTexto.push(`Especialidade: ${d.filtros.especialidade}`);

  if (filtrosTexto.length > 0) {
    doc.setTextColor("#5a6e60");
    doc.setFontSize(9);
    doc.text("Filtros: " + filtrosTexto.join(" · "), margin, y);
    y += 6;
  }

  // 4 KPIs principais
  doc.setTextColor("#1a3623");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Indicadores principais", margin, y);
  y += 4;

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: "Cobertura da base",
      value: `${d.coberturaPct.toFixed(1)}%`,
      sub: `${d.agg.contatado.toLocaleString("pt-BR")} de ${d.agg.pool_total.toLocaleString("pt-BR")}`,
    },
    {
      label: "Taxa de resposta",
      value: `${d.responseRatePct.toFixed(1)}%`,
      sub: `${d.agg.em_conversa.toLocaleString("pt-BR")} em conversa`,
    },
    {
      label: "Quentes em aberto",
      value: d.agg.quentes.toLocaleString("pt-BR"),
      sub: d.tempoMedioQuente !== null ? `Tempo médio: ${d.tempoMedioQuente.toFixed(0)}h` : "",
    },
    {
      label: "Convertidos",
      value: d.agg.convertidos.toLocaleString("pt-BR"),
      sub: `${d.conversionPct.toFixed(2)}% conv.`,
    },
  ];

  const kpiWidth = (pageW - 2 * margin - 9) / 4;
  const kpiHeight = 22;
  kpis.forEach((k, i) => {
    const x = margin + i * (kpiWidth + 3);
    doc.setDrawColor("#d6e3d9");
    doc.setFillColor("#f5faf7");
    doc.roundedRect(x, y, kpiWidth, kpiHeight, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setTextColor("#5a6e60");
    doc.setFont("helvetica", "normal");
    doc.text(k.label.toUpperCase(), x + 3, y + 5);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(GSS_GREEN);
    doc.text(k.value, x + 3, y + 13);
    if (k.sub) {
      doc.setFontSize(7);
      doc.setTextColor("#5a6e60");
      doc.setFont("helvetica", "normal");
      doc.text(k.sub, x + 3, y + 19);
    }
  });
  y += kpiHeight + 6;

  // Stats operacionais
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1a3623");
  doc.text("Operação", margin, y);
  y += 3;

  const stats = [
    ["Campanhas ativas/pausadas", String(d.agg.campanhas)],
    ["Disparos últimas 24h", d.agg.disparos_24h.toLocaleString("pt-BR")],
    ["Disparos últimos 7 dias", d.agg.disparos_7d.toLocaleString("pt-BR")],
    ["Médicos sem WhatsApp", d.descartadosPhone.toLocaleString("pt-BR")],
  ];
  autoTable(doc, {
    startY: y,
    head: [],
    body: stats,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5, textColor: "#1a3623" },
    columnStyles: { 0: { textColor: "#5a6e60" }, 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error autotable adds lastAutoTable to doc
  y = (doc.lastAutoTable?.finalY ?? y) + 8;

  // Tabela performance por campanha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#1a3623");
  doc.text(`Performance por campanha (${d.rows.length})`, margin, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Campanha", "UF", "Base", "Cont.", "%", "Em conv.", "Quentes", "Conv.", "24h", "Status"]],
    body: d.rows.map((r) => {
      const pct = r.pool_total ? ((r.contatado ?? 0) / r.pool_total) * 100 : 0;
      return [
        r.nome,
        r.regiao_estado ?? "-",
        String(r.pool_total ?? 0),
        String(r.contatado ?? 0),
        `${pct.toFixed(0)}%`,
        String(r.em_conversa ?? 0),
        String(r.quentes ?? 0),
        String(r.convertidos ?? 0),
        String(r.disparos_24h ?? 0),
        r.status,
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: GSS_GREEN, textColor: "#ffffff", fontSize: 8 },
    alternateRowStyles: { fillColor: "#f5faf7" },
    margin: { left: margin, right: margin },
  });

  // Footer com paginação
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor("#8a9d92");
    doc.text(
      `Sigma GSS · ${dataHumana()} · página ${i} de ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  doc.save(nomeArquivo("pdf"));
}

export function exportarDashboardExcel(d: DashboardExportData) {
  const wb = XLSX.utils.book_new();

  // Linha de cabeçalho amplo
  const meta: Array<Array<string | number>> = [
    ["Sigma GSS — Dashboard de Prospecção"],
    [`Gerado em ${dataHumana()}`],
    [],
  ];

  if (d.filtros.campanha || d.filtros.estado || d.filtros.especialidade) {
    meta.push(["Filtros aplicados:"]);
    if (d.filtros.campanha) meta.push(["Campanha", d.filtros.campanha]);
    if (d.filtros.estado) meta.push(["Estado", d.filtros.estado]);
    if (d.filtros.especialidade)
      meta.push(["Especialidade", d.filtros.especialidade]);
    meta.push([]);
  }

  meta.push(["RESUMO GERAL"]);
  meta.push(["Campanhas ativas/pausadas", d.agg.campanhas]);
  meta.push(["Cobertura da base", `${d.coberturaPct.toFixed(1)}%`]);
  meta.push(["Contatado", d.agg.contatado]);
  meta.push(["Base total", d.agg.pool_total]);
  meta.push(["Taxa de resposta", `${d.responseRatePct.toFixed(1)}%`]);
  meta.push(["Em conversa", d.agg.em_conversa]);
  meta.push(["Quentes em aberto", d.agg.quentes]);
  meta.push(["Convertidos", d.agg.convertidos]);
  meta.push([
    "Tempo médio quente",
    d.tempoMedioQuente !== null ? `${d.tempoMedioQuente.toFixed(0)}h` : "—",
  ]);
  meta.push(["Disparos 24h", d.agg.disparos_24h]);
  meta.push(["Disparos 7 dias", d.agg.disparos_7d]);
  meta.push(["Médicos sem WhatsApp", d.descartadosPhone]);
  meta.push([]);

  // Header da tabela
  meta.push([
    "Campanha",
    "UF",
    "Base",
    "Contatado",
    "% Cobertura",
    "Em conversa",
    "Quentes",
    "Convertidos",
    "Disparos 24h",
    "Status",
    "Quente mais antigo (h)",
  ]);

  // Linhas
  d.rows.forEach((r) => {
    const pct = r.pool_total ? ((r.contatado ?? 0) / r.pool_total) * 100 : 0;
    meta.push([
      r.nome,
      r.regiao_estado ?? "",
      r.pool_total ?? 0,
      r.contatado ?? 0,
      `${pct.toFixed(1)}%`,
      r.em_conversa ?? 0,
      r.quentes ?? 0,
      r.convertidos ?? 0,
      r.disparos_24h ?? 0,
      r.status,
      r.quente_mais_antigo_h ?? 0,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(meta);

  // Largura das colunas
  ws["!cols"] = [
    { wch: 40 }, // Campanha
    { wch: 6 }, // UF
    { wch: 10 }, // Base
    { wch: 12 }, // Contatado
    { wch: 12 }, // %
    { wch: 12 }, // Em conv.
    { wch: 10 }, // Quentes
    { wch: 12 }, // Convertidos
    { wch: 12 }, // Disparos
    { wch: 10 }, // Status
    { wch: 22 }, // Quente mais antigo
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Dashboard");
  XLSX.writeFile(wb, nomeArquivo("xlsx"));
}
