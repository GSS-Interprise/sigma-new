import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Clock, 
  Send, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Calendar,
  Users,
  Mail,
  Eye,
  User,
  Phone,
  MapPin
} from "lucide-react";
import { useState } from "react";
import { LeadStatusManager } from "./LeadStatusManager";
import { toast } from "sonner";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";

interface LeadWithDetails {
  id: string;
  nome: string;
  email: string | null;
  phone_e164: string | null;
  especialidade: string | null;
  uf: string | null;
  origem: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export function AbaAcompanhamento() {
  const [leadSelecionado, setLeadSelecionado] = useState<LeadWithDetails | null>(null);
  const queryClient = useQueryClient();

  // Buscar configuração de status de leads
  const { data: statusConfig = [] } = useQuery({
    queryKey: ['kanban-status-config', 'leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_status_config')
        .select('*')
        .eq('modulo', 'leads')
        .eq('ativo', true)
        .order('ordem');
      
      if (error) throw error;
      return data || [];
    }
  });

  // Buscar leads agrupados por status
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ["leads-acompanhamento"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data || []) as LeadWithDetails[];
    },
  });

  // Buscar contagem de propostas por lead
  const { data: propostasCount = {} } = useQuery({
    queryKey: ["propostas-count-by-lead"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("lead_id");

      if (error) {
        console.error("Erro ao buscar propostas:", error);
        return {};
      }
      
      const counts: Record<string, number> = {};
      data?.forEach((p: any) => {
        if (p.lead_id) {
          counts[p.lead_id] = (counts[p.lead_id] || 0) + 1;
        }
      });
      
      return counts;
    },
  });

  // Mutation para atualizar status do lead
  const updateLeadStatus = useMutation({
    mutationFn: async ({ leadId, newStatus }: { leadId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status do lead atualizado");
      queryClient.invalidateQueries({ queryKey: ["leads-acompanhamento"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar status");
    }
  });

  // Agrupar leads por status
  const leadsPorStatus = statusConfig.reduce((acc, config) => {
    acc[config.status_id] = leads.filter(lead => lead.status === config.status_id);
    return acc;
  }, {} as Record<string, LeadWithDetails[]>);

  // Adicionar leads com status não configurados (fallback)
  const statusNaoConfigurados = [...new Set(leads.map(l => l.status).filter(Boolean))].filter(
    status => status && !statusConfig.find(c => c.status_id === status)
  );

  if (isLoadingLeads) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded"></div>
                <div className="h-3 bg-muted rounded w-5/6"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getStatusIcon = (statusId: string | undefined | null) => {
    const id = (statusId || '').toLowerCase();
    switch (id) {
      case 'novo': return Clock;
      case 'acompanhamento': return Send;
      case 'em resposta': return MessageSquare;
      case 'proposta enviada': return Send;
      case 'proposta aceita': return CheckCircle;
      case 'proposta recusada': return XCircle;
      case 'qualificado': return CheckCircle;
      case 'convertido': return CheckCircle;
      case 'descartado': return XCircle;
      default: return Clock;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header com gerenciador de status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Acompanhamento de Leads</h2>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie leads por status no funil de captação
          </p>
        </div>
        <LeadStatusManager />
      </div>

      {/* Colunas de status configuradas */}
      {statusConfig.map((config) => {
        const Icon = getStatusIcon(config.status_id);
        const items = leadsPorStatus[config.status_id] || [];

        if (items.length === 0) return null;

        return (
          <div key={config.id} className="space-y-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: config.cor || '#3b82f6' }}
              />
              <Icon className="h-5 w-5" style={{ color: config.cor || '#3b82f6' }} />
              <h3 className="text-lg font-semibold">{config.label}</h3>
              <Badge variant="secondary">{items.length}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((lead) => (
                <Card key={lead.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base line-clamp-1">
                        {lead.nome}
                      </CardTitle>
                      <Badge 
                        variant="outline"
                        style={{ 
                          backgroundColor: `${config.cor}15`,
                          borderColor: `${config.cor}40`,
                          color: config.cor || '#3b82f6'
                        }}
                      >
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {lead.especialidade && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{lead.especialidade}</span>
                      </div>
                    )}

                    {lead.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">{lead.email}</span>
                      </div>
                    )}

                    {lead.phone_e164 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{lead.phone_e164}</span>
                      </div>
                    )}

                    {lead.uf && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{lead.uf}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(new Date(lead.updated_at || lead.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>

                    {/* Propostas vinculadas */}
                    {propostasCount[lead.id] > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {propostasCount[lead.id]} {propostasCount[lead.id] === 1 ? 'proposta' : 'propostas'}
                      </Badge>
                    )}

                    {lead.origem && (
                      <Badge variant="outline" className="text-xs">
                        {lead.origem}
                      </Badge>
                    )}

                    <div className="pt-2 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setLeadSelecionado(lead)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Ver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {/* Status não configurados (fallback) */}
      {statusNaoConfigurados.map((status) => {
        const items = leads.filter(l => l.status === status);
        if (items.length === 0) return null;

        return (
          <div key={status} className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{status}</h3>
              <Badge variant="secondary">{items.length}</Badge>
              <Badge variant="outline" className="text-xs">Não configurado</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((lead) => (
                <Card key={lead.id} className="hover:shadow-lg transition-shadow border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base line-clamp-1">
                      {lead.nome}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {lead.especialidade && (
                      <p className="text-sm text-muted-foreground">{lead.especialidade}</p>
                    )}
                    {lead.email && (
                      <p className="text-sm text-muted-foreground truncate">{lead.email}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setLeadSelecionado(lead)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ver Lead
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {leads.length === 0 && (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Nenhum lead encontrado
          </p>
        </Card>
      )}

      {/* Prontuário Médico */}
      <LeadProntuarioDialog
        open={!!leadSelecionado}
        onOpenChange={(open) => !open && setLeadSelecionado(null)}
        leadId={leadSelecionado?.id || null}
      />
    </div>
  );
}
