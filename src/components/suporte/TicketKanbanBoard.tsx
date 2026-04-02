import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, User, Calendar, Tag, CheckCircle, MessageCircle, AlertTriangle, Clock, UserCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface KanbanTicket {
  id: string;
  numero: string;
  descricao: string;
  status: string;
  tipo: string;
  destino: string;
  data_abertura: string;
  solicitante_nome: string;
  setor_nome: string | null;
  setor_responsavel: string;
  ultima_visualizacao_admin: string | null;
  nivel_urgencia: 'critica' | 'alta' | 'media' | 'baixa' | null;
  tipo_impacto: string | null;
  responsavel_ti_nome: string | null;
  sla_resposta_minutos: number | null;
  sla_resolucao_minutos: number | null;
  data_primeira_resposta: string | null;
}

const KANBAN_COLUMNS = [
  { id: "aberto", label: "Aberto", color: "bg-gray-500", wip: 15 },
  { id: "em_analise", label: "Em Análise", color: "bg-blue-500", wip: 10 },
  { id: "em_validacao", label: "Em Validação", color: "bg-purple-500", wip: 10 },
  { id: "aguardando_confirmacao", label: "Aguardando Confirmação", color: "bg-emerald-500", wip: 15 },
  { id: "concluido", label: "Finalizado", color: "bg-green-600", wip: null },
];

const TIPO_LABELS = {
  software: "Software",
  hardware: "Hardware",
};

const DESTINO_LABELS = {
  interno: "Interno",
  externo: "Externo",
};

const URGENCIA_CONFIG = {
  critica: { label: "Crítica", color: "bg-red-600 text-white", border: "border-l-4 border-l-red-600", icon: "🔴" },
  alta: { label: "Alta", color: "bg-orange-500 text-white", border: "border-l-4 border-l-orange-500", icon: "🟠" },
  media: { label: "Média", color: "bg-yellow-500 text-black", border: "border-l-4 border-l-yellow-500", icon: "🟡" },
  baixa: { label: "Baixa", color: "bg-green-500 text-white", border: "border-l-4 border-l-green-500", icon: "🟢" },
};

const TIPO_IMPACTO_LABELS: Record<string, string> = {
  sistema: "Sistema",
  infraestrutura: "Infraestrutura",
  acesso_permissao: "Acesso/Permissão",
  integracao: "Integração",
  duvida_operacional: "Dúvida/Operacional",
  melhoria: "Melhoria",
};

interface TicketKanbanBoardProps {
  onTicketClick: (ticketId: string) => void;
  filtros?: {
    busca: string;
    tipo: string;
    destino: string;
    setor: string;
  };
}

export function TicketKanbanBoard({ onTicketClick, filtros }: TicketKanbanBoardProps) {
  const queryClient = useQueryClient();
  const [draggedTicket, setDraggedTicket] = useState<string | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-tickets-kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suporte_tickets")
        .select("*")
        .order("data_abertura", { ascending: false });

      if (error) throw error;
      return data as KanbanTicket[];
    },
  });

  // Função para calcular status do SLA
  const getSlaStatus = (ticket: KanbanTicket) => {
    if (!ticket.sla_resolucao_minutos || ticket.status === 'concluido') return null;
    
    const abertura = new Date(ticket.data_abertura);
    const agora = new Date();
    const minutosPassados = differenceInMinutes(agora, abertura);
    const percentual = (minutosPassados / ticket.sla_resolucao_minutos) * 100;
    
    if (percentual >= 100) return { status: 'vencido', label: 'SLA Vencido', color: 'text-red-600' };
    if (percentual >= 75) return { status: 'critico', label: 'SLA Crítico', color: 'text-orange-500' };
    if (percentual >= 50) return { status: 'atencao', label: 'SLA Atenção', color: 'text-yellow-600' };
    return null;
  };

  // Buscar comentários externos (do usuário) para verificar respostas não lidas
  const { data: comentariosPorTicket = {} } = useQuery({
    queryKey: ["tickets-comentarios-externos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suporte_comentarios")
        .select("ticket_id, created_at, is_externo")
        .eq("is_externo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Agrupar comentários externos por ticket (pegar o mais recente de cada)
      const grouped: Record<string, { ultima_resposta_externa: string }> = {};
      
      data?.forEach(comentario => {
        if (!grouped[comentario.ticket_id]) {
          grouped[comentario.ticket_id] = {
            ultima_resposta_externa: comentario.created_at
          };
        }
      });

      return grouped;
    },
  });

  // Verificar quais tickets têm respostas externas não lidas
  const getTicketStatus = (ticket: KanbanTicket) => {
    const comentariosTicket = comentariosPorTicket[ticket.id];
    if (!comentariosTicket) return { temResposta: false, naoLida: false };

    const ultimaVisualizacao = ticket.ultima_visualizacao_admin 
      ? new Date(ticket.ultima_visualizacao_admin).getTime()
      : 0;
    
    const ultimaRespostaExterna = new Date(comentariosTicket.ultima_resposta_externa).getTime();
    
    return {
      temResposta: true,
      naoLida: ultimaRespostaExterna > ultimaVisualizacao
    };
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, newStatus }: { ticketId: string; newStatus: string }) => {
      const validStatus = newStatus as "aberto" | "pendente" | "em_analise" | "aguardando_usuario" | "em_validacao" | "aguardando_confirmacao" | "concluido";
      
      const { error } = await supabase
        .from("suporte_tickets")
        .update({ 
          status: validStatus,
          data_ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets-kanban"] });
      toast.success("Status do ticket atualizado");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status");
      console.error(error);
    },
  });

  const marcarComoResolvidoMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      // Buscar nome do usuário atual
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', userData?.user?.id)
        .single();

      const { error } = await supabase
        .from("suporte_tickets")
        .update({ 
          status: "aguardando_confirmacao",
          data_ultima_atualizacao: new Date().toISOString(),
          resolvido_por_id: userData?.user?.id,
          resolvido_por_nome: profile?.nome_completo || userData?.user?.email || 'Usuário',
        })
        .eq("id", ticketId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets-kanban"] });
      toast.success("Ticket marcado como resolvido. Aguardando confirmação do usuário.");
    },
    onError: (error) => {
      toast.error("Erro ao marcar ticket como resolvido");
      console.error(error);
    },
  });

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    setDraggedTicket(ticketId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (draggedTicket) {
      updateStatusMutation.mutate({ ticketId: draggedTicket, newStatus });
      setDraggedTicket(null);
    }
  };

  const getTicketsByStatus = (status: string) => {
    // Sem coluna "pendente": agrupar tickets pendentes em "aberto"
    let filtered =
      tickets?.filter((t) =>
        status === "aberto"
          ? t.status === "aberto" || t.status === "pendente"
          : t.status === status
      ) || [];
    
    if (filtros) {
      // Filtro por busca (número ou nome do solicitante)
      if (filtros.busca && filtros.busca.trim()) {
        const busca = filtros.busca.toLowerCase().trim();
        filtered = filtered.filter(t => 
          t.numero?.toLowerCase().includes(busca) ||
          t.solicitante_nome?.toLowerCase().includes(busca) ||
          t.descricao?.toLowerCase().includes(busca)
        );
      }
      
      // Filtro por tipo
      if (filtros.tipo && filtros.tipo !== 'todos') {
        filtered = filtered.filter(t => t.tipo === filtros.tipo);
      }
      
      // Filtro por destino
      if (filtros.destino && filtros.destino !== 'todos') {
        filtered = filtered.filter(t => t.destino === filtros.destino);
      }
      
      // Filtro por setor
      if (filtros.setor && filtros.setor !== 'todos') {
        filtered = filtered.filter(t => t.setor_responsavel === filtros.setor);
      }
    }
    
    return filtered;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 overflow-x-auto overflow-y-hidden pb-4 px-1" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
      {KANBAN_COLUMNS.map((column) => {
        const columnTickets = getTicketsByStatus(column.id);
        
        return (
          <div
            key={column.id}
            className="flex-shrink-0 w-80 flex flex-col h-full"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="mb-4 flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <div className={cn("w-3 h-3 rounded-full flex-shrink-0", column.color)} />
                <h3 className="font-semibold text-base">{column.label}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "font-medium",
                    column.wip && columnTickets.length > column.wip && "bg-destructive text-destructive-foreground"
                  )}
                >
                  {columnTickets.length}{column.wip ? `/${column.wip}` : ''}
                </Badge>
              </div>
            </div>

            <ScrollArea 
              className={cn(
                "flex-1 rounded-lg border-2 transition-all duration-300 min-h-0",
                "bg-muted/20 hover:bg-muted/40",
                column.wip && columnTickets.length > column.wip 
                  ? "border-destructive/50 bg-destructive/5" 
                  : "border-transparent",
                "hover:shadow-lg"
              )}
            >
              <div className="p-3 space-y-3 w-full">
                {columnTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground">
                      Nenhum ticket
                    </p>
                  </div>
                ) : (
                  columnTickets.map((ticket) => {
                    const comentarioStatus = getTicketStatus(ticket);
                    const urgenciaConfig = ticket.nivel_urgencia ? URGENCIA_CONFIG[ticket.nivel_urgencia] : null;
                    const slaStatus = getSlaStatus(ticket);
                    
                    return (
                      <Card
                        key={ticket.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ticket.id)}
                        className={cn(
                          "hover:shadow-lg transition-all w-full relative",
                          comentarioStatus.naoLida && "border-2 border-red-500",
                          urgenciaConfig?.border,
                          ticket.nivel_urgencia === 'critica' && "shadow-red-200 shadow-md animate-pulse"
                        )}
                      >
                        {/* Indicadores no topo */}
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                          {slaStatus && (
                            <span title={slaStatus.label}>
                              <AlertTriangle className={cn("h-4 w-4", slaStatus.color)} />
                            </span>
                          )}
                          {comentarioStatus.temResposta && (
                            <MessageCircle 
                              className={cn(
                                "h-4 w-4",
                                comentarioStatus.naoLida ? "text-red-500 fill-red-500" : "text-green-500 fill-green-500"
                              )}
                            />
                          )}
                        </div>
                        
                        <div onClick={() => onTicketClick(ticket.id)} className="cursor-pointer">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm font-semibold text-primary break-words min-w-0">
                                {ticket.numero}
                              </CardTitle>
                            </div>
                            
                            {/* Badges de urgência e tipo */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {urgenciaConfig && (
                                <Badge className={cn("text-[10px] px-1.5 py-0", urgenciaConfig.color)}>
                                  {urgenciaConfig.icon} {urgenciaConfig.label}
                                </Badge>
                              )}
                              <Badge 
                                variant="outline" 
                                className={cn("text-[10px] px-1.5 py-0", column.color, "text-white border-0")}
                              >
                                {TIPO_LABELS[ticket.tipo as keyof typeof TIPO_LABELS]}
                              </Badge>
                            </div>
                            
                            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 overflow-hidden break-all">
                              {ticket.descricao}
                            </p>
                          </CardHeader>
                        
                          <CardContent className="space-y-1.5 text-xs pt-0">
                            {/* Tipo de impacto */}
                            {ticket.tipo_impacto && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {TIPO_IMPACTO_LABELS[ticket.tipo_impacto] || ticket.tipo_impacto}
                              </Badge>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {DESTINO_LABELS[ticket.destino as keyof typeof DESTINO_LABELS]}
                              </Badge>
                              {ticket.setor_responsavel && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  <Tag className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                                  <span className="truncate max-w-[60px]">{ticket.setor_responsavel}</span>
                                </Badge>
                              )}
                            </div>
                            
                            {/* Responsável TI */}
                            {ticket.responsavel_ti_nome && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <UserCog className="h-3 w-3 flex-shrink-0 text-blue-500" />
                                <span className="truncate text-blue-600 font-medium">{ticket.responsavel_ti_nome}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <User className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate min-w-0">{ticket.solicitante_nome}</span>
                            </div>
                            
                            {ticket.setor_nome && (
                              <div className="text-muted-foreground truncate text-[10px]">
                                Setor: {ticket.setor_nome}
                              </div>
                            )}
                            
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="h-3 w-3 flex-shrink-0" />
                              <span className="whitespace-nowrap">
                                {format(new Date(ticket.data_abertura), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>

                            {/* Indicador SLA */}
                            {slaStatus && (
                              <div className={cn("flex items-center gap-1 font-medium", slaStatus.color)}>
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                <span className="text-[10px]">{slaStatus.label}</span>
                              </div>
                            )}
                          </CardContent>
                        </div>

                        {(ticket.status === "em_analise" || ticket.status === "em_validacao") && (
                          <CardContent className="pt-0 pb-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-green-300 text-green-700 hover:bg-green-50 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                marcarComoResolvidoMutation.mutate(ticket.id);
                              }}
                              disabled={marcarComoResolvidoMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Marcar como Resolvido
                            </Button>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}