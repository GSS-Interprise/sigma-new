import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Upload, Download, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import AgesLeadImportDialog from "./AgesLeadImportDialog";
import { AgesLeadProntuarioDialog } from "./AgesLeadProntuarioDialog";

interface AgesLead {
  id: string;
  nome: string;
  profissao: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string | null;
  status: string;
  created_at: string;
}

const statusLabels: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500" },
  em_contato: { label: "Em Contato", color: "bg-amber-500" },
  convertido: { label: "Convertido", color: "bg-green-500" },
  descartado: { label: "Descartado", color: "bg-gray-500" },
  // Status do Kanban de Acompanhamento
  novo_canal_lead: { label: "Em Acompanhamento", color: "bg-purple-500" },
  captando_informacoes: { label: "Em Acompanhamento", color: "bg-purple-500" },
  revisar_dados: { label: "Em Acompanhamento", color: "bg-purple-500" },
  pronto_cadastro: { label: "Em Acompanhamento", color: "bg-purple-500" },
  cadastrado: { label: "Cadastrado", color: "bg-emerald-500" },
  validacao_documental: { label: "Em Validação", color: "bg-cyan-500" },
  ativo: { label: "Ativo", color: "bg-green-600" },
};

// Status que significam que o lead está na aba de Leads (ainda não foi para Acompanhamento)
const STATUS_LEADS_INICIAIS = ['novo', 'em_contato', 'descartado'];

const AgesLeadsTab = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<AgesLead | null>(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["ages-leads", search],
    queryFn: async () => {
      let query = supabase
        .from("ages_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (search) {
        query = query.or(`nome.ilike.%${search}%,profissao.ilike.%${search}%,telefone.ilike.%${search}%`);
      }

      // Filtrar apenas leads que ainda não foram para o acompanhamento
      query = query.in('status', STATUS_LEADS_INICIAIS);

      const { data, error } = await query;
      if (error) throw error;
      return data as AgesLead[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ages_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-leads"] });
      queryClient.invalidateQueries({ queryKey: ["ages-kanban-cards"] });
      toast.success("Lead removido");
    },
    onError: () => {
      toast.error("Erro ao remover");
    },
  });

  // Buscar a primeira coluna do kanban ages_leads para enviar para acompanhamento
  const { data: primeiraColuna } = useQuery({
    queryKey: ["ages-kanban-primeira-coluna"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_status_config")
        .select("status_id")
        .eq("modulo", "ages_leads")
        .order("ordem", { ascending: true })
        .limit(1)
        .single();
      if (error) return null;
      return data?.status_id;
    },
  });

  const enviarParaAcompanhamentoMutation = useMutation({
    mutationFn: async (lead: AgesLead) => {
      // Atualizar status do lead para a primeira coluna do Kanban (Acompanhamento)
      const statusAcompanhamento = primeiraColuna || "novo_canal_lead";
      
      const { error: leadError } = await supabase
        .from("ages_leads")
        .update({ 
          status: statusAcompanhamento,
          updated_at: new Date().toISOString()
        })
        .eq("id", lead.id);

      if (leadError) throw leadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-leads"] });
      queryClient.invalidateQueries({ queryKey: ["ages-kanban-cards"] });
      toast.success("Lead enviado para Acompanhamento");
    },
    onError: () => {
      toast.error("Erro ao enviar para acompanhamento");
    },
  });

  const handleEdit = (lead: AgesLead) => {
    setSelectedLead(lead);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setSelectedLead(null);
    setDialogOpen(true);
  };

  const handleDownloadTemplate = () => {
    const csvContent = "nome,profissao,telefone,email,cidade,uf,origem\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_leads_ages.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, profissão ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
            <Download className="h-4 w-4" />
            Modelo Excel
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Importar
          </Button>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Lead
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Profissão</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum lead encontrado
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const statusInfo = statusLabels[lead.status] || { label: lead.status, color: "bg-gray-400" };
                return (
                  <TableRow 
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEdit(lead)}
                  >
                    <TableCell className="font-medium">{lead.nome}</TableCell>
                    <TableCell>{lead.profissao || "-"}</TableCell>
                    <TableCell>{lead.telefone || "-"}</TableCell>
                    <TableCell>{lead.email || "-"}</TableCell>
                    <TableCell>
                      {lead.cidade && lead.uf ? `${lead.cidade}/${lead.uf}` : lead.uf || "-"}
                    </TableCell>
                    <TableCell>{lead.origem || "-"}</TableCell>
                    <TableCell>
                      <Badge className={`${statusInfo.color} text-white`}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(lead.created_at), "dd/MM/yy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {lead.status === "novo" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Enviar este lead para Acompanhamento?")) {
                                enviarParaAcompanhamentoMutation.mutate(lead);
                              }
                            }}
                            title="Enviar para Acompanhamento"
                          >
                            <UserCheck className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(lead);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Remover este lead?")) {
                              deleteMutation.mutate(lead.id);
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

      <AgesLeadProntuarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadId={selectedLead?.id || null}
        isNewLead={!selectedLead}
      />

      <AgesLeadImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
};

export default AgesLeadsTab;
