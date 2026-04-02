import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import AgesContratoDialog from "./AgesContratoDialog";

interface AgesContrato {
  id: string;
  codigo_contrato: string | null;
  codigo_interno: number | null;
  tipo_contrato: string | null;
  data_inicio: string;
  data_fim: string | null;
  prazo_meses: number | null;
  valor_mensal: number | null;
  valor_hora: number | null;
  carga_horaria_mensal: number | null;
  status: string;
  assinado: string | null;
  motivo_pendente: string | null;
  objeto_contrato: string | null;
  observacoes: string | null;
  condicao_pagamento: string | null;
  valor_estimado: string | null;
  dias_antecedencia_aviso: number | null;
  profissional_id: string | null;
  ages_cliente_id: string | null;
  ages_unidade_id: string | null;
  ages_unidades_ids: string[] | null; // Novo campo para múltiplas unidades
  profissional?: { id: string; nome: string } | null;
  ages_cliente?: { 
    id: string; 
    nome_empresa: string;
    nome_fantasia: string | null;
    razao_social: string | null;
    cnpj: string | null;
    endereco: string | null;
    email_contato: string | null;
    telefone_contato: string | null;
    uf: string | null;
    cidade: string | null;
  } | null;
  ages_unidade?: { id: string; nome: string } | null;
  ages_unidades_list?: Array<{ id: string; nome: string }> | null; // Lista expandida de unidades
}

const statusLabels: Record<string, { label: string; color: string }> = {
  Ativo: { label: "Ativo", color: "bg-green-500" },
  ativo: { label: "Ativo", color: "bg-green-500" },
  Inativo: { label: "Inativo", color: "bg-gray-500" },
  inativo: { label: "Inativo", color: "bg-gray-500" },
  Encerrado: { label: "Encerrado", color: "bg-red-500" },
  encerrado: { label: "Encerrado", color: "bg-red-500" },
  Suspenso: { label: "Suspenso", color: "bg-amber-500" },
  suspenso: { label: "Suspenso", color: "bg-amber-500" },
  "Pre-Contrato": { label: "Pré-Contrato", color: "bg-blue-500" },
  "Em Renovação": { label: "Em Renovação", color: "bg-purple-500" },
  "Em Processo de Renovação": { label: "Em Processo de Renovação", color: "bg-purple-500" },
  vencido: { label: "Vencido", color: "bg-red-500" },
  rescindido: { label: "Rescindido", color: "bg-gray-500" },
  em_negociacao: { label: "Em Negociação", color: "bg-amber-500" },
};

const AgesContratosTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<AgesContrato | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [statusSort, setStatusSort] = useState<"asc" | "desc" | null>(null);

  // Buscar contratos com aditivos para calcular data fim real
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ["ages-contratos-com-aditivos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_contratos")
        .select(`
          *,
          profissional:ages_profissionais(id, nome),
          ages_cliente:ages_clientes(id, nome_empresa, nome_fantasia, razao_social, cnpj, endereco, email_contato, telefone_contato, uf, cidade),
          ages_unidade:ages_unidades(id, nome)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Buscar aditivos para cada contrato para determinar a data fim real
      const contratoIds = data?.map(c => c.id) || [];
      const { data: aditivos } = await supabase
        .from("ages_contrato_aditivos")
        .select("contrato_id, data_termino")
        .in("contrato_id", contratoIds)
        .order("data_termino", { ascending: false });

      // Mapear o último aditivo de cada contrato
      const ultimoAditivoPorContrato: Record<string, string> = {};
      aditivos?.forEach(a => {
        if (!ultimoAditivoPorContrato[a.contrato_id] || a.data_termino > ultimoAditivoPorContrato[a.contrato_id]) {
          ultimoAditivoPorContrato[a.contrato_id] = a.data_termino;
        }
      });

      // Adicionar data_fim_real (considerando aditivos)
      return (data || []).map(c => ({
        ...c,
        data_fim_real: ultimoAditivoPorContrato[c.id] || c.data_fim
      })) as (AgesContrato & { data_fim_real?: string })[];
    },
  });

  // Contagem de status para exibir no dropdown
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contratos.forEach((c) => {
      const normalizedStatus = statusLabels[c.status]?.label || c.status;
      counts[normalizedStatus] = (counts[normalizedStatus] || 0) + 1;
    });
    return counts;
  }, [contratos]);

  // Filtragem e ordenação
  const filteredContratos = useMemo(() => {
    let result = [...contratos];
    
    // Filtrar por busca (ID ou Cliente)
    if (search.trim()) {
      const searchLower = search.toLowerCase().trim();
      result = result.filter((c) => {
        const idMatch = c.codigo_interno?.toString().includes(searchLower);
        const clienteMatch = c.ages_cliente?.nome_empresa?.toLowerCase().includes(searchLower) ||
                            c.ages_cliente?.nome_fantasia?.toLowerCase().includes(searchLower);
        return idMatch || clienteMatch;
      });
    }
    
    // Filtrar por status
    if (statusFilter !== "__all__") {
      result = result.filter((c) => {
        const normalizedStatus = statusLabels[c.status]?.label || c.status;
        return normalizedStatus === statusFilter;
      });
    }
    
    // Ordenar por status
    if (statusSort) {
      result.sort((a, b) => {
        const statusA = statusLabels[a.status]?.label || a.status;
        const statusB = statusLabels[b.status]?.label || b.status;
        return statusSort === "asc" 
          ? statusA.localeCompare(statusB) 
          : statusB.localeCompare(statusA);
      });
    }
    
    return result;
  }, [contratos, search, statusFilter, statusSort]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ages_contratos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-contratos"] });
      toast.success("Contrato removido");
    },
    onError: () => {
      toast.error("Erro ao remover");
    },
  });

  const handleEdit = (c: AgesContrato) => {
    setSelectedContrato(c);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setSelectedContrato(null);
    setDialogOpen(true);
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Contrato
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">ID</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent">
                      <span>Status</span>
                      {statusSort === "asc" ? (
                        <ArrowUp className="ml-2 h-4 w-4" />
                      ) : statusSort === "desc" ? (
                        <ArrowDown className="ml-2 h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setStatusSort("asc")}>
                      <ArrowUp className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      Ordenar A-Z
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStatusSort("desc")}>
                      <ArrowDown className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                      Ordenar Z-A
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setStatusFilter("__all__")}>
                      {statusFilter === "__all__" && <Check className="mr-2 h-3.5 w-3.5" />}
                      {statusFilter !== "__all__" && <span className="mr-2 w-3.5" />}
                      Todos
                    </DropdownMenuItem>
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>
                        {statusFilter === status && <Check className="mr-2 h-3.5 w-3.5" />}
                        {statusFilter !== status && <span className="mr-2 w-3.5" />}
                        {status}
                        <span className="ml-auto text-muted-foreground">({count})</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableHead>
              <TableHead>Tipo</TableHead>
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
            ) : filteredContratos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum contrato encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredContratos.map((c) => {
                const statusInfo = statusLabels[c.status] || { label: c.status, color: "bg-gray-400" };
                // Usar parseLocalDate para evitar problema de fuso horário (-1 dia)
                const dataInicio = parseLocalDate(c.data_inicio);
                // Usar data_fim_real que considera aditivos
                const dataFimReal = (c as any).data_fim_real || c.data_fim;
                const dataFim = dataFimReal ? parseLocalDate(dataFimReal) : null;
                
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.codigo_interno || "-"}</TableCell>
                    <TableCell>{c.ages_cliente?.nome_empresa || "-"}</TableCell>
                    <TableCell>
                      {dataInicio ? format(dataInicio, "dd/MM/yyyy", { locale: ptBR }) : "-"}
                    </TableCell>
                    <TableCell>
                      {dataFim ? format(dataFim, "dd/MM/yyyy", { locale: ptBR }) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusInfo.color} text-white`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.tipo_contrato || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Remover este contrato?")) {
                              deleteMutation.mutate(c.id);
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

      <AgesContratoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contrato={selectedContrato}
      />
    </div>
  );
};

export default AgesContratosTab;
