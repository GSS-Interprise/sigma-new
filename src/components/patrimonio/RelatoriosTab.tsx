import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function RelatoriosTab() {
  const [tipoRelatorio, setTipoRelatorio] = useState("categoria");

  const { data: patrimonio } = useQuery({
    queryKey: ["patrimonio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patrimonio")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  const generatePorCategoria = () => {
    if (!patrimonio || patrimonio.length === 0) {
      toast.error("Nenhum dado disponível");
      return null;
    }

    const grouped: Record<string, any[]> = {};
    patrimonio.forEach(item => {
      if (!grouped[item.categoria]) {
        grouped[item.categoria] = [];
      }
      grouped[item.categoria].push(item);
    });

    return Object.entries(grouped).map(([categoria, items]) => ({
      categoria: categoria.charAt(0).toUpperCase() + categoria.slice(1),
      quantidade: items.length,
      valorTotal: items.reduce((sum, item) => sum + Number(item.valor_aquisicao), 0),
      items
    }));
  };

  const generatePorSetor = () => {
    if (!patrimonio || patrimonio.length === 0) {
      toast.error("Nenhum dado disponível");
      return null;
    }

    const grouped: Record<string, any[]> = {};
    patrimonio.forEach(item => {
      const setor = item.setor || "Sem Setor";
      if (!grouped[setor]) {
        grouped[setor] = [];
      }
      grouped[setor].push(item);
    });

    return Object.entries(grouped).map(([setor, items]) => ({
      setor,
      quantidade: items.length,
      valorTotal: items.reduce((sum, item) => sum + Number(item.valor_aquisicao), 0),
      items
    }));
  };

  const generateBaixados = () => {
    if (!patrimonio || patrimonio.length === 0) {
      toast.error("Nenhum dado disponível");
      return null;
    }

    return patrimonio.filter(item => 
      item.status === 'baixado' || item.estado_conservacao === 'inservivel'
    );
  };

  const exportToExcel = () => {
    let data: any[] = [];
    let sheetName = "";

    if (tipoRelatorio === "categoria") {
      const grouped = generatePorCategoria();
      if (!grouped) return;

      data = grouped.flatMap(group => 
        group.items.map(item => ({
          "Categoria": group.categoria,
          "Código": item.codigo_bem,
          "Nome": item.nome,
          "Localização": item.localizacao || "-",
          "Valor": Number(item.valor_aquisicao),
          "Status": item.status
        }))
      );
      sheetName = "Por Categoria";
    } else if (tipoRelatorio === "setor") {
      const grouped = generatePorSetor();
      if (!grouped) return;

      data = grouped.flatMap(group => 
        group.items.map(item => ({
          "Setor": group.setor,
          "Código": item.codigo_bem,
          "Nome": item.nome,
          "Responsável": item.responsavel || "-",
          "Valor": Number(item.valor_aquisicao),
          "Status": item.status
        }))
      );
      sheetName = "Por Setor";
    } else {
      const baixados = generateBaixados();
      if (!baixados) return;

      data = baixados.map(item => ({
        "Código": item.codigo_bem,
        "Nome": item.nome,
        "Categoria": item.categoria,
        "Status": item.status,
        "Conservação": item.estado_conservacao,
        "Data Aquisição": new Date(item.data_aquisicao).toLocaleDateString('pt-BR'),
        "Valor": Number(item.valor_aquisicao)
      }));
      sheetName = "Baixados e Inservíveis";
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    XLSX.writeFile(wb, `relatorio_patrimonio_${tipoRelatorio}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório exportado em Excel!");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Cabeçalho
    doc.setFontSize(18);
    doc.text("Relatório de Patrimônio", 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Tipo: ${tipoRelatorio === 'categoria' ? 'Por Categoria' : tipoRelatorio === 'setor' ? 'Por Setor' : 'Baixados/Inservíveis'}`, 14, 28);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

    let tableData: any[] = [];
    let headers: string[] = [];

    if (tipoRelatorio === "categoria") {
      const grouped = generatePorCategoria();
      if (!grouped) return;

      headers = ["Categoria", "Código", "Nome", "Valor", "Status"];
      tableData = grouped.flatMap(group => 
        group.items.map(item => [
          group.categoria,
          item.codigo_bem,
          item.nome,
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao)),
          item.status
        ])
      );
    } else if (tipoRelatorio === "setor") {
      const grouped = generatePorSetor();
      if (!grouped) return;

      headers = ["Setor", "Código", "Nome", "Responsável", "Valor"];
      tableData = grouped.flatMap(group => 
        group.items.map(item => [
          group.setor,
          item.codigo_bem,
          item.nome,
          item.responsavel || "-",
          new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao))
        ])
      );
    } else {
      const baixados = generateBaixados();
      if (!baixados) return;

      headers = ["Código", "Nome", "Status", "Conservação", "Valor"];
      tableData = baixados.map(item => [
        item.codigo_bem,
        item.nome,
        item.status,
        item.estado_conservacao,
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao))
      ]);
    }

    autoTable(doc, {
      startY: 40,
      head: [headers],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [139, 92, 246] }
    });

    doc.save(`relatorio_patrimonio_${tipoRelatorio}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Relatório exportado em PDF!");
  };

  const renderPreview = () => {
    if (tipoRelatorio === "categoria") {
      const grouped = generatePorCategoria();
      if (!grouped) return <p className="text-muted-foreground">Nenhum dado disponível</p>;

      return (
        <div className="space-y-4">
          {grouped.map((group, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between">
                  <span>{group.categoria}</span>
                  <span className="text-sm text-muted-foreground">
                    {group.quantidade} {group.quantidade === 1 ? 'item' : 'itens'} • {' '}
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(group.valorTotal)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                      <span>{item.codigo_bem} - {item.nome}</span>
                      <span className="text-muted-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao))}
                      </span>
                    </div>
                  ))}
                  {group.items.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{group.items.length - 3} itens adicionais
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (tipoRelatorio === "setor") {
      const grouped = generatePorSetor();
      if (!grouped) return <p className="text-muted-foreground">Nenhum dado disponível</p>;

      return (
        <div className="space-y-4">
          {grouped.map((group, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="text-lg flex justify-between">
                  <span>{group.setor}</span>
                  <span className="text-sm text-muted-foreground">
                    {group.quantidade} {group.quantidade === 1 ? 'item' : 'itens'} • {' '}
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(group.valorTotal)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                      <span>{item.codigo_bem} - {item.nome}</span>
                      <span className="text-muted-foreground">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao))}
                      </span>
                    </div>
                  ))}
                  {group.items.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{group.items.length - 3} itens adicionais
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (tipoRelatorio === "baixados") {
      const baixados = generateBaixados();
      if (!baixados) return <p className="text-muted-foreground">Nenhum dado disponível</p>;

      return (
        <Card>
          <CardHeader>
            <CardTitle>Bens Baixados ou Inservíveis ({baixados.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {baixados.map((item) => (
                <div key={item.id} className="flex justify-between text-sm border-b pb-2">
                  <div className="flex-1">
                    <p className="font-medium">{item.codigo_bem} - {item.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.categoria} • {item.status} • {item.estado_conservacao}
                    </p>
                  </div>
                  <span className="text-muted-foreground">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.valor_aquisicao))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <Label>Tipo de Relatório</Label>
            <Select value={tipoRelatorio} onValueChange={setTipoRelatorio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="categoria">Bens por Categoria</SelectItem>
                <SelectItem value="setor">Bens por Setor/Localização</SelectItem>
                <SelectItem value="baixados">Bens Baixados ou Inservíveis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={exportToExcel}>
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
            <Button variant="outline" onClick={exportToPDF}>
              <FileText className="mr-2 h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </Card>

      <div>
        {renderPreview()}
      </div>
    </div>
  );
}
