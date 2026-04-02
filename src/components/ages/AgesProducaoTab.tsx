import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AgesProducaoDialog from "./AgesProducaoDialog";

interface AgesProducao {
  id: string;
  mes_referencia: number;
  ano_referencia: number;
  total_horas: number;
  tipo_alocacao: string | null;
  status_conferencia: string;
  profissional?: { id: string; nome: string } | null;
  ages_cliente?: { id: string; nome_empresa: string } | null;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-amber-500" },
  conferido: { label: "Conferido", color: "bg-blue-500" },
  aprovado: { label: "Aprovado", color: "bg-green-500" },
};

const mesesNomes = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const AgesProducaoTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProducao, setSelectedProducao] = useState<AgesProducao | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  const { data: producoes = [], isLoading } = useQuery({
    queryKey: ["ages-producao", search],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_producao")
        .select(`
          *,
          profissional:ages_profissionais(id, nome),
          ages_cliente:ages_clientes(id, nome_empresa)
        `)
        .order("ano_referencia", { ascending: false })
        .order("mes_referencia", { ascending: false });

      if (error) throw error;
      return data as AgesProducao[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ages_producao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-producao"] });
      toast.success("Registro removido");
    },
    onError: () => {
      toast.error("Erro ao remover");
    },
  });

  const handleEdit = (p: AgesProducao) => {
    setSelectedProducao(p);
    setExtractedData(null);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setSelectedProducao(null);
    setExtractedData(null);
    setDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, envie uma imagem da folha de ponto");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 10MB");
      return;
    }

    setIsExtracting(true);
    toast.info("Analisando folha de ponto com IA...");

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        const { data, error } = await supabase.functions.invoke("parse-folha-ponto", {
          body: { imageBase64: base64 }
        });

        if (error) {
          console.error("Erro na extração:", error);
          toast.error("Erro ao analisar a folha de ponto");
          setIsExtracting(false);
          return;
        }

        if (data?.success && data?.data) {
          toast.success("Dados extraídos com sucesso!");
          setExtractedData(data.data);
          setSelectedProducao(null);
          setDialogOpen(true);
        } else {
          toast.error(data?.error || "Não foi possível extrair os dados");
        }
        setIsExtracting(false);
      };
      reader.onerror = () => {
        toast.error("Erro ao ler o arquivo");
        setIsExtracting(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro:", error);
      toast.error("Erro ao processar a imagem");
      setIsExtracting(false);
    }

    // Reset input
    e.target.value = "";
  };

  const filteredProducoes = producoes.filter((p) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      p.profissional?.nome?.toLowerCase().includes(searchLower) ||
      p.ages_cliente?.nome_empresa?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por profissional ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2 relative"
            disabled={isExtracting}
          >
            {isExtracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isExtracting ? "Analisando..." : "Importar via IA"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={isExtracting}
            />
          </Button>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Registro
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profissional</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Mês/Ano</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead>Tipo Alocação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredProducoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredProducoes.map((p) => {
                const statusInfo = statusLabels[p.status_conferencia] || { label: p.status_conferencia, color: "bg-gray-400" };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.profissional?.nome || "-"}</TableCell>
                    <TableCell>{p.ages_cliente?.nome_empresa || "-"}</TableCell>
                    <TableCell>
                      {mesesNomes[p.mes_referencia - 1]}/{p.ano_referencia}
                    </TableCell>
                    <TableCell>{p.total_horas}h</TableCell>
                    <TableCell>{p.tipo_alocacao || "-"}</TableCell>
                    <TableCell>
                      <Badge className={`${statusInfo.color} text-white`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Remover este registro?")) {
                              deleteMutation.mutate(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AgesProducaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        producao={selectedProducao}
        extractedData={extractedData}
      />
    </div>
  );
};

export default AgesProducaoTab;
