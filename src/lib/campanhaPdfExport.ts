import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import logoSigma from "@/assets/gss-logo.png";

// Sigma brand colors (HSL --primary: 123 63% 23%  ≈ #155F1E)
const SIGMA_GREEN: [number, number, number] = [21, 95, 30];
const SIGMA_GREEN_LIGHT: [number, number, number] = [76, 175, 80];
const SIGMA_DARK: [number, number, number] = [33, 37, 41];
const SIGMA_MUTED: [number, number, number] = [108, 117, 125];

interface CampanhaResumo {
  campanha: {
    nome?: string;
    descricao?: string | null;
    canal?: string | null;
    status?: string | null;
    objetivo?: string | null;
    data_inicio?: string | null;
    data_termino?: string | null;
  };
  vinculos: any[];
  disparosDetalhe?: any[];
  totais: {
    propostas: number;
    listas: number;
    leads: number;
    disparos: number;
    enviados: number;
    falhas: number;
  };
}

export const exportCampanhaPropostasPDF = (data: CampanhaResumo) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header bar
  doc.setFillColor(...SIGMA_GREEN);
  doc.rect(0, 0, pageWidth, 32, "F");

  // Logo
  try {
    doc.addImage(logoSigma, "PNG", 12, 6, 20, 20);
  } catch {
    /* ignore */
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SIGMA · Relatório de Campanha", 38, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Emitido em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    38,
    23
  );

  // Título da campanha
  let y = 44;
  doc.setTextColor(...SIGMA_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(data.campanha.nome || "Campanha", 14, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SIGMA_MUTED);
  const meta: string[] = [];
  if (data.campanha.canal) meta.push(`Canal: ${data.campanha.canal}`);
  if (data.campanha.status) meta.push(`Status: ${data.campanha.status}`);
  if (data.campanha.objetivo) meta.push(`Objetivo: ${data.campanha.objetivo}`);
  if (data.campanha.data_inicio)
    meta.push(`Início: ${format(new Date(data.campanha.data_inicio), "dd/MM/yyyy")}`);
  if (data.campanha.data_termino)
    meta.push(`Término: ${format(new Date(data.campanha.data_termino), "dd/MM/yyyy")}`);
  if (meta.length) {
    doc.text(meta.join("  •  "), 14, y);
    y += 6;
  }

  if (data.campanha.descricao) {
    doc.setTextColor(...SIGMA_DARK);
    const desc = doc.splitTextToSize(data.campanha.descricao, pageWidth - 28);
    doc.text(desc, 14, y);
    y += desc.length * 4 + 4;
  }

  // Cards de resumo
  y += 2;
  const cards = [
    { label: "Propostas", value: data.totais.propostas },
    { label: "Listas", value: data.totais.listas },
    { label: "Leads", value: data.totais.leads },
    { label: "Mensagens enviadas", value: data.totais.enviados },
  ];
  const cardW = (pageWidth - 28 - 9) / 4;
  const cardH = 22;
  cards.forEach((c, i) => {
    const x = 14 + i * (cardW + 3);
    doc.setFillColor(...SIGMA_GREEN);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(String(c.value), x + cardW / 2, y + 12, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(c.label, x + cardW / 2, y + 18, { align: "center" });
  });
  y += cardH + 8;

  // Sub-resumo de execução
  doc.setTextColor(...SIGMA_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Execução dos disparos", 14, y);
  y += 4;

  // Período coberto pelos disparos
  const detalhe = data.disparosDetalhe || [];
  let periodoLabel = "—";
  if (detalhe.length) {
    const datas = detalhe
      .flatMap((d: any) => [d.created_at, d.updated_at])
      .filter(Boolean)
      .map((d: string) => new Date(d).getTime());
    if (datas.length) {
      const min = new Date(Math.min(...datas));
      const max = new Date(Math.max(...datas));
      periodoLabel =
        format(min, "dd/MM/yyyy", { locale: ptBR }) +
        " a " +
        format(max, "dd/MM/yyyy", { locale: ptBR });
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SIGMA_MUTED);
  doc.text(`Período dos disparos: ${periodoLabel}`, 14, y);
  doc.setTextColor(...SIGMA_DARK);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [["Contatos programados", "Mensagens enviadas", "Falhas"]],
    body: [[
      String(data.totais.disparos),
      String(data.totais.enviados),
      String(data.totais.falhas),
    ]],
    theme: "grid",
    styles: { fontSize: 9, halign: "center" },
    headStyles: { fillColor: SIGMA_GREEN_LIGHT, textColor: 255, fontStyle: "bold" },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Detalhe dos disparos (com datas)
  if (detalhe.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Detalhe dos disparos", 14, y);
    y += 2;
    const detRows = detalhe.map((d: any) => [
      d.nome || "—",
      String(d.total_contatos ?? 0),
      String(d.enviados ?? 0),
      String(d.falhas ?? 0),
      d.status || "—",
      d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy HH:mm") : "—",
      d.updated_at ? format(new Date(d.updated_at), "dd/MM/yyyy HH:mm") : "—",
    ]);
    autoTable(doc, {
      startY: y + 2,
      head: [["Disparo", "Programados", "Enviados", "Falhas", "Status", "Criado em", "Atualizado em"]],
      body: detRows,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: SIGMA_GREEN, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 250, 245] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Tabela de propostas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Propostas vinculadas", 14, y);
  y += 2;

  const rows = data.vinculos.map((v: any) => [
    v.proposta?.id_proposta || v.proposta?.descricao || "—",
    v.lista?.nome || "—",
    String(v.lista_leads_count ?? 0),
    v.status || "—",
    v.webhook_trafego_enviado_at ? "Sim" : "Não",
    v.created_at ? format(new Date(v.created_at), "dd/MM/yyyy") : "—",
  ]);

  autoTable(doc, {
    startY: y + 2,
    head: [["Proposta", "Lista", "Leads", "Status", "Tráfego", "Vinculada em"]],
    body: rows.length ? rows : [["—", "—", "0", "—", "—", "—"]],
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: SIGMA_GREEN, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 250, 245] },
    margin: { left: 14, right: 14 },
  });

  // Footer em todas as páginas
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...SIGMA_GREEN);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SIGMA_MUTED);
    doc.text("SIGMA · GSS", 14, pageHeight - 8);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }

  const safeName = (data.campanha.nome || "campanha")
    .replace(/[^\w\-]+/g, "_")
    .toLowerCase();
  doc.save(`relatorio_campanha_${safeName}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
};