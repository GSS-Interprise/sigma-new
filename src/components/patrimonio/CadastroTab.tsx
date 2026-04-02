import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Download, Pencil, Trash2, Search } from "lucide-react";
import { PatrimonioDialog } from "./PatrimonioDialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export function CadastroTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState<string>("todos");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  const { data: patrimonio, isLoading, refetch } = useQuery({
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

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este bem?")) return;

    const { error } = await supabase
      .from("patrimonio")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir bem");
      return;
    }

    toast.success("Bem excluído com sucesso");
    refetch();
  };

  const handleEdit = (item: any) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleExportExcel = () => {
    if (!patrimonio || patrimonio.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const exportData = patrimonio.map(item => ({
      "Código": item.codigo_bem,
      "Nome": item.nome,
      "Categoria": item.categoria,
      "Localização": item.localizacao || "",
      "Setor": item.setor || "",
      "Responsável": item.responsavel || "",
      "Data Aquisição": new Date(item.data_aquisicao).toLocaleDateString('pt-BR'),
      "Valor": Number(item.valor_aquisicao),
      "Vida Útil (anos)": item.vida_util_anos || "",
      "Conservação": item.estado_conservacao,
      "Status": item.status,
      "Nº Série": item.numero_serie || "",
      "Fornecedor": item.fornecedor || ""
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patrimônio");

    const colWidths = [
      { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 20 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
      { wch: 12 }, { wch: 20 }, { wch: 25 }
    ];
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `patrimonio_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Planilha exportada com sucesso!");
  };

  const filteredPatrimonio = patrimonio?.filter(item => {
    const matchesSearch = 
      item.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.codigo_bem.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategoria = filterCategoria === "todos" || item.categoria === filterCategoria;
    const matchesStatus = filterStatus === "todos" || item.status === filterStatus;

    return matchesSearch && matchesCategoria && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      ativo: "default",
      transferido: "secondary",
      baixado: "destructive"
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  const getConservacaoBadge = (conservacao: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      novo: "default",
      usado: "secondary",
      danificado: "destructive",
      inservivel: "destructive"
    };
    return <Badge variant={variants[conservacao] || "default"}>{conservacao}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex-1 min-w-[250px]">
            <Label htmlFor="search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label>Categoria</Label>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="equipamento">Equipamento</SelectItem>
                <SelectItem value="mobiliario">Mobiliário</SelectItem>
                <SelectItem value="veiculo">Veículo</SelectItem>
                <SelectItem value="informatica">Informática</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="transferido">Transferido</SelectItem>
                <SelectItem value="baixado">Baixado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => { setSelectedItem(null); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Bem
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Conservação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredPatrimonio && filteredPatrimonio.length > 0 ? (
              filteredPatrimonio.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.codigo_bem}</TableCell>
                  <TableCell>{item.nome}</TableCell>
                  <TableCell className="capitalize">{item.categoria}</TableCell>
                  <TableCell>{item.localizacao || "-"}</TableCell>
                  <TableCell>{item.responsavel || "-"}</TableCell>
                  <TableCell>
                    {new Intl.NumberFormat('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    }).format(Number(item.valor_aquisicao))}
                  </TableCell>
                  <TableCell>{getConservacaoBadge(item.estado_conservacao)}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Nenhum bem encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <PatrimonioDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setSelectedItem(null);
        }}
        item={selectedItem}
        onSuccess={refetch}
      />
    </div>
  );
}
