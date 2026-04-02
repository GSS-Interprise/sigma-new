import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export const exportMedicosToPDF = (medicos: any[], filteredCount: number) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.text('Relatório de Médicos - Sigma', 14, 22);
  
  doc.setFontSize(10);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
  doc.text(`Total de registros: ${filteredCount}`, 14, 36);
  
  // Table
  const tableData = medicos.map((medico) => [
    medico.nome_completo,
    Array.isArray(medico.especialidade) ? medico.especialidade.join(', ') : medico.especialidade || '-',
    medico.crm || '-',
    medico.estado || '-',
    medico.status_medico || '-',
    medico.clientes_alocados?.map((c: any) => c.nome_fantasia).join(', ') || '-'
  ]);
  
  autoTable(doc, {
    head: [['Nome', 'Especialidade', 'CRM', 'Estado', 'Status', 'Cliente']],
    body: tableData,
    startY: 42,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  
  doc.save(`medicos_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

export const exportClientesToPDF = (clientes: any[], filteredCount: number) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.text('Relatório de Clientes - Sigma', 14, 22);
  
  doc.setFontSize(10);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
  doc.text(`Total de registros: ${filteredCount}`, 14, 36);
  
  // Table
  const tableData = clientes.map((cliente) => [
    cliente.nome_fantasia || '-',
    cliente.razao_social || '-',
    cliente.cnpj || '-',
    cliente.uf || '-',
    cliente.status_cliente || '-',
    cliente.especialidade_cliente || '-'
  ]);
  
  autoTable(doc, {
    head: [['Nome Fantasia', 'Razão Social', 'CNPJ', 'UF', 'Status', 'Especialidade']],
    body: tableData,
    startY: 42,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  
  doc.save(`clientes_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};

export const exportContratosToPDF = (contratos: any[], filteredCount: number) => {
  const doc = new jsPDF('landscape');
  
  // Header
  doc.setFontSize(18);
  doc.text('Relatório de Contratos - Sigma', 14, 22);
  
  doc.setFontSize(10);
  doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);
  doc.text(`Total de registros: ${filteredCount}`, 14, 36);
  
  // Table
  const tableData = contratos.map((contrato) => [
    contrato.cliente?.nome_fantasia || contrato.medico?.nome_completo || '-',
    contrato.codigo_contrato || '-',
    format(new Date(contrato.data_inicio), 'dd/MM/yyyy'),
    format(new Date(contrato.data_fim), 'dd/MM/yyyy'),
    contrato.status_contrato || '-',
    contrato.assinado === 'Sim' ? 'Assinado' : 'Pendente',
    contrato.valor_estimado ? `R$ ${Number(contrato.valor_estimado).toLocaleString('pt-BR')}` : '-'
  ]);
  
  autoTable(doc, {
    head: [['Cliente/Médico', 'Código', 'Data Início', 'Data Fim', 'Status', 'Assinatura', 'Valor']],
    body: tableData,
    startY: 42,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  
  doc.save(`contratos_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
};
