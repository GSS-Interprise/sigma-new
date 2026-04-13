import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { User, Mail, Phone, FileText, Calendar, CreditCard, Loader2, Settings, UserCheck, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { LeadStatusManager } from "./LeadStatusManager";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";

interface Lead {
  id: string;
  nome: string;
  cpf: string | null;
  crm: string | null;
  data_nascimento: string | null;
  especialidade: string | null;
  uf: string | null;
  email: string | null;
  phone_e164: string;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
  tags: string[] | null;
  convertido_por_nome: string | null;
}

interface TagConfig {
  nome: string;
  cor_id: string;
}

interface CaptacaoKanbanProps {
  searchTerm?: string;
}

export function CaptacaoKanban({ searchTerm = "" }: CaptacaoKanbanProps) {
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);

  const { data: columns = [], isLoading: isLoadingColumns } = useKanbanColumns("disparos");

  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ["acompanhamento-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .neq("status", "Novo")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      
      // Get unique convertido_por IDs and fetch names
      const userIds = [...new Set((data || []).map((l: any) => l.convertido_por).filter(Boolean))];
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome_completo")
          .in("id", userIds);
        if (profiles) {
          userMap = Object.fromEntries(profiles.map(p => [p.id, p.nome_completo || '']));
        }
      }
      
      return (data || []).map((l: any) => ({
        ...l,
        convertido_por_nome: l.convertido_por ? (userMap[l.convertido_por] || null) : null,
      })) as Lead[];
    },
  });

  // Fetch tag configurations for colors
  const { data: tagConfigs = [] } = useQuery({
    queryKey: ["leads-etiquetas-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads_etiquetas_config")
        .select("*");
      if (error) throw error;
      return data as TagConfig[];
    },
  });

  const TAG_COLORS = [
    { id: "green", bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
    { id: "blue", bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
    { id: "purple", bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" },
    { id: "orange", bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" },
    { id: "pink", bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-200" },
    { id: "yellow", bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
    { id: "red", bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
    { id: "gray", bg: "bg-gray-700", text: "text-white", border: "border-gray-800" },
  ];

  const getTagColor = (tagName: string) => {
    const config = tagConfigs.find((c) => c.nome === tagName);
    const colorId = config?.cor_id || "gray";
    return TAG_COLORS.find((c) => c.id === colorId) || TAG_COLORS[TAG_COLORS.length - 1];
  };

  // Realtime subscription for kanban columns
  useEffect(() => {
    const channel = supabase
      .channel('kanban-columns-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kanban_status_config'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kanban-columns", "disparos"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ leadId, newStatus }: { leadId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar status:", error);
      toast.error(error.message || "Erro ao atualizar status");
    },
  });


  const handleDragStart = (leadId: string) => {
    setDraggedLead(leadId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (draggedLead) {
      updateStatusMutation.mutate({ leadId: draggedLead, newStatus });
      setDraggedLead(null);
    }
  };

  const getLeadsByStatus = (statusId: string) => {
    return leads.filter((lead) => {
      if (lead.status !== statusId) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        lead.nome?.toLowerCase().includes(term) ||
        lead.phone_e164?.toLowerCase().includes(term) ||
        lead.cpf?.toLowerCase().includes(term) ||
        lead.email?.toLowerCase().includes(term) ||
        lead.especialidade?.toLowerCase().includes(term)
      );
    });
  };

  const handleViewDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setDialogOpen(true);
  };

  if (isLoadingColumns || isLoadingLeads) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, CPF..."
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["acompanhamento-leads"] });
              queryClient.invalidateQueries({ queryKey: ["kanban-columns", "disparos"] });
              toast.success("Kanban atualizado");
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar Kanban
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusManagerOpen(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Gerenciar Colunas
          </Button>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 h-[calc(100vh-220px)]">
        {columns.map((column) => {
          const columnLeads = getLeadsByStatus(column.id);
          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
              className="flex flex-col min-w-[280px] max-w-[320px] flex-shrink-0"
            >
              <Card className="flex flex-col h-full">
                <CardHeader className="pb-3 flex-shrink-0">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-2 w-2 rounded-full" 
                        style={{ backgroundColor: column.cor || 'hsl(var(--primary))' }}
                      />
                      <span>{column.label}</span>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                      {columnLeads.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="space-y-2 pr-3">
                      {columnLeads.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum lead nesta etapa
                        </p>
                      ) : (
                        columnLeads.map((lead) => (
                          <Card
                            key={lead.id}
                            draggable
                            onDragStart={() => handleDragStart(lead.id)}
                            className="cursor-move hover:shadow-md transition-shadow"
                            onClick={() => handleViewDetails(lead)}
                          >
                            <CardContent className="p-3 space-y-2">
                              {/* Nome */}
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-primary flex-shrink-0" />
                                <h4 className="font-semibold text-sm line-clamp-1">
                                  {lead.nome}
                                </h4>
                              </div>

                              {/* Informações */}
                              <div className="space-y-1.5 text-xs">
                                {lead.cpf && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <CreditCard className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{lead.cpf}</span>
                                  </div>
                                )}

                                {lead.crm && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <FileText className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">CRM: {lead.crm}</span>
                                  </div>
                                )}

                                {lead.phone_e164 && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Phone className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{lead.phone_e164}</span>
                                  </div>
                                )}

                                {lead.email && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Mail className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{lead.email}</span>
                                  </div>
                                )}

                                {lead.data_nascimento && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Calendar className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">
                                      {format(new Date(lead.data_nascimento + 'T00:00:00'), 'dd/MM/yyyy')}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Etiquetas */}
                              {lead.tags && lead.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {lead.tags.map((tag) => {
                                    const color = getTagColor(tag);
                                    return (
                                      <Badge
                                        key={tag}
                                        className={`text-xs ${color.bg} ${color.text} ${color.border} border`}
                                      >
                                        {tag}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Badges */}
                              <div className="flex flex-wrap gap-1">
                                {lead.especialidade && (
                                  <Badge variant="secondary" className="text-xs">
                                    {lead.especialidade}
                                  </Badge>
                                )}
                                {lead.uf && (
                                  <Badge variant="outline" className="text-xs">
                                    {lead.uf}
                                  </Badge>
                                )}
                                {lead.convertido_por_nome && (
                                  <Badge variant="outline" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
                                    <UserCheck className="h-3 w-3" />
                                    {lead.convertido_por_nome.split(' ')[0]}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      <LeadProntuarioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadId={selectedLead?.id || null}
      />

      <LeadStatusManager
        open={statusManagerOpen}
        onOpenChange={setStatusManagerOpen}
      />
    </>
  );
}
