import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInMinutes, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, AlertTriangle, Clock, ChevronUp, ChevronDown, AlertCircle, User, Calendar, Inbox, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketListItem {
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
  nivel_urgencia: 'critica' | 'alta' | 'media' | 'baixa' | null;
  tipo_impacto: string | null;
  responsavel_ti_id: string | null;
  responsavel_ti_nome: string | null;
  sla_resolucao_minutos: number | null;
  data_ultima_atualizacao: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  pendente: "Pendente",
  em_analise: "Em Análise",
  aguardando_usuario: "Aguardando Usuário",
  em_validacao: "Em Validação",
  aguardando_confirmacao: "Aguardando Confirmação",
  concluido: "Concluído",
};

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-gray-500 text-white",
  pendente: "bg-gray-400 text-white",
  em_analise: "bg-blue-500 text-white",
  aguardando_usuario: "bg-orange-500 text-white",
  em_validacao: "bg-purple-500 text-white",
  aguardando_confirmacao: "bg-cyan-500 text-white",
  concluido: "bg-green-500 text-white",
};

const URGENCIA_CONFIG = {
  critica: { label: "Crítica", color: "bg-red-600 text-white", order: 0 },
  alta: { label: "Alta", color: "bg-orange-500 text-white", order: 1 },
  media: { label: "Média", color: "bg-yellow-500 text-black", order: 2 },
  baixa: { label: "Baixa", color: "bg-green-500 text-white", order: 3 },
};

const TIPO_LABELS: Record<string, string> = {
  software: "Incidente",
  hardware: "Solicitação",
};

type QuickFilter = 'todos' | 'alta_prioridade' | 'sla_vencido' | 'sla_24h' | 'meus_tickets' | 'aguardando_usuario' | 'sem_interacao';

interface TicketListViewProps {
  onTicketClick: (ticketId: string) => void;
  filtros?: {
    busca: string;
    tipo: string;
    destino: string;
    setor: string;
  };
}

export function TicketListView({ onTicketClick, filtros }: TicketListViewProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('todos');
  const [sortField, setSortField] = useState<'prioridade' | 'sla' | 'data'>('prioridade');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Buscar usuário atual
  const { data: currentUser } = useQuery({
    queryKey: ["current-user-tickets"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["admin-tickets-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suporte_tickets")
        .select("*")
        .neq("status", "concluido")
        .order("data_abertura", { ascending: false });

      if (error) throw error;
      return data as TicketListItem[];
    },
  });

  // Calcular status do SLA
  const getSlaInfo = (ticket: TicketListItem) => {
    if (!ticket.sla_resolucao_minutos) return { status: 'sem_sla', minutosRestantes: null, percentual: 0 };
    
    const abertura = new Date(ticket.data_abertura);
    const agora = new Date();
    const minutosPassados = differenceInMinutes(agora, abertura);
    const minutosRestantes = ticket.sla_resolucao_minutos - minutosPassados;
    const percentual = (minutosPassados / ticket.sla_resolucao_minutos) * 100;
    
    if (percentual >= 100) return { status: 'vencido', minutosRestantes, percentual };
    if (minutosRestantes <= 60 * 24) return { status: 'critico', minutosRestantes, percentual }; // < 24h
    if (percentual >= 75) return { status: 'atencao', minutosRestantes, percentual };
    return { status: 'ok', minutosRestantes, percentual };
  };

  // Calcular dias sem interação
  const getDiasSemInteracao = (ticket: TicketListItem) => {
    const ultimaAtualizacao = ticket.data_ultima_atualizacao 
      ? new Date(ticket.data_ultima_atualizacao) 
      : new Date(ticket.data_abertura);
    return differenceInDays(new Date(), ultimaAtualizacao);
  };

  // Formatar tempo restante de SLA
  const formatSlaRestante = (minutosRestantes: number | null) => {
    if (minutosRestantes === null) return '-';
    if (minutosRestantes <= 0) return 'Vencido';
    
    const horas = Math.floor(Math.abs(minutosRestantes) / 60);
    const dias = Math.floor(horas / 24);
    
    if (dias > 0) return `${dias}d ${horas % 24}h`;
    return `${horas}h`;
  };

  // Aplicar filtros e ordenação
  const filteredAndSortedTickets = useMemo(() => {
    if (!tickets) return [];

    let result = [...tickets];

    // Filtros básicos (vindos do header)
    if (filtros) {
      if (filtros.busca && filtros.busca.trim()) {
        const busca = filtros.busca.toLowerCase().trim();
        result = result.filter(t => 
          t.numero?.toLowerCase().includes(busca) ||
          t.solicitante_nome?.toLowerCase().includes(busca) ||
          t.descricao?.toLowerCase().includes(busca)
        );
      }
      if (filtros.tipo && filtros.tipo !== 'todos') {
        result = result.filter(t => t.tipo === filtros.tipo);
      }
      if (filtros.destino && filtros.destino !== 'todos') {
        result = result.filter(t => t.destino === filtros.destino);
      }
      if (filtros.setor && filtros.setor !== 'todos') {
        result = result.filter(t => t.setor_responsavel === filtros.setor);
      }
    }

    // Filtros rápidos
    switch (quickFilter) {
      case 'alta_prioridade':
        result = result.filter(t => t.nivel_urgencia === 'critica' || t.nivel_urgencia === 'alta');
        break;
      case 'sla_vencido':
        result = result.filter(t => getSlaInfo(t).status === 'vencido');
        break;
      case 'sla_24h':
        result = result.filter(t => {
          const sla = getSlaInfo(t);
          return sla.status === 'critico' || sla.status === 'vencido';
        });
        break;
      case 'meus_tickets':
        result = result.filter(t => t.responsavel_ti_id === currentUser?.id);
        break;
      case 'aguardando_usuario':
        result = result.filter(t => t.status === 'aguardando_usuario');
        break;
      case 'sem_interacao':
        result = result.filter(t => getDiasSemInteracao(t) >= 3);
        break;
    }

    // Ordenação composta: Prioridade -> SLA -> Data
    result.sort((a, b) => {
      // 1. Por prioridade
      const prioridadeA = a.nivel_urgencia ? URGENCIA_CONFIG[a.nivel_urgencia].order : 999;
      const prioridadeB = b.nivel_urgencia ? URGENCIA_CONFIG[b.nivel_urgencia].order : 999;
      if (prioridadeA !== prioridadeB) {
        return sortDirection === 'asc' ? prioridadeA - prioridadeB : prioridadeB - prioridadeA;
      }

      // 2. Por SLA (vencidos primeiro, depois por tempo restante)
      const slaA = getSlaInfo(a);
      const slaB = getSlaInfo(b);
      const slaOrderA = slaA.status === 'vencido' ? -1000000 : (slaA.minutosRestantes ?? 999999);
      const slaOrderB = slaB.status === 'vencido' ? -1000000 : (slaB.minutosRestantes ?? 999999);
      if (slaOrderA !== slaOrderB) {
        return slaOrderA - slaOrderB;
      }

      // 3. Por data de abertura (mais antigos primeiro)
      return new Date(a.data_abertura).getTime() - new Date(b.data_abertura).getTime();
    });

    return result;
  }, [tickets, filtros, quickFilter, sortDirection, currentUser?.id]);

  const quickFilterButtons: { key: QuickFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'todos', label: 'Todos', icon: <Inbox className="h-3.5 w-3.5" /> },
    { key: 'alta_prioridade', label: 'Alta Prioridade', icon: <AlertCircle className="h-3.5 w-3.5" /> },
    { key: 'sla_vencido', label: 'SLA Vencido', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { key: 'sla_24h', label: 'SLA < 24h', icon: <Clock className="h-3.5 w-3.5" /> },
    { key: 'meus_tickets', label: 'Meus Tickets', icon: <User className="h-3.5 w-3.5" /> },
    { key: 'aguardando_usuario', label: 'Aguardando Usuário', icon: <MessageSquareWarning className="h-3.5 w-3.5" /> },
    { key: 'sem_interacao', label: 'Sem Interação +3d', icon: <Calendar className="h-3.5 w-3.5" /> },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Filtros rápidos */}
      <div className="flex flex-wrap gap-2">
        {quickFilterButtons.map((btn) => (
          <Button
            key={btn.key}
            variant={quickFilter === btn.key ? "default" : "outline"}
            size="sm"
            onClick={() => setQuickFilter(btn.key)}
            className={cn(
              "gap-1.5 text-xs",
              quickFilter === btn.key && btn.key === 'sla_vencido' && "bg-red-600 hover:bg-red-700",
              quickFilter === btn.key && btn.key === 'alta_prioridade' && "bg-orange-500 hover:bg-orange-600"
            )}
          >
            {btn.icon}
            {btn.label}
          </Button>
        ))}
      </div>

      {/* Contador */}
      <div className="text-sm text-muted-foreground">
        {filteredAndSortedTickets.length} ticket(s) encontrado(s)
      </div>

      {/* Tabela */}
      <ScrollArea className="flex-1 border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[100px] font-semibold">Código</TableHead>
              <TableHead className="w-[100px] font-semibold">
                <button 
                  className="flex items-center gap-1 hover:text-foreground"
                  onClick={() => {
                    if (sortField === 'prioridade') {
                      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('prioridade');
                      setSortDirection('asc');
                    }
                  }}
                >
                  Prioridade
                  {sortField === 'prioridade' && (
                    sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[130px] font-semibold">Status</TableHead>
              <TableHead className="w-[100px] font-semibold">Setor</TableHead>
              <TableHead className="w-[150px] font-semibold">Responsável</TableHead>
              <TableHead className="w-[100px] font-semibold">SLA</TableHead>
              <TableHead className="w-[100px] font-semibold">Abertura</TableHead>
              <TableHead className="w-[100px] font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Solicitante</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedTickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum ticket encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedTickets.map((ticket) => {
                const urgenciaConfig = ticket.nivel_urgencia ? URGENCIA_CONFIG[ticket.nivel_urgencia] : null;
                const slaInfo = getSlaInfo(ticket);
                const diasSemInteracao = getDiasSemInteracao(ticket);

                return (
                  <TableRow
                    key={ticket.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50 transition-colors",
                      slaInfo.status === 'vencido' && "bg-red-50 dark:bg-red-950/20",
                      ticket.nivel_urgencia === 'critica' && "bg-red-100 dark:bg-red-950/30",
                      ticket.destino === 'externo' && slaInfo.status !== 'vencido' && ticket.nivel_urgencia !== 'critica' && "bg-blue-50 dark:bg-blue-950/20"
                    )}
                    onClick={() => onTicketClick(ticket.id)}
                  >
                    <TableCell className="font-mono font-semibold text-primary">
                      {ticket.numero}
                    </TableCell>
                    <TableCell>
                      {urgenciaConfig ? (
                        <Badge className={cn("text-xs", urgenciaConfig.color)}>
                          {urgenciaConfig.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          N/D
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", STATUS_COLORS[ticket.status])}>
                        {STATUS_LABELS[ticket.status] || ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ticket.setor_responsavel || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ticket.responsavel_ti_nome || (
                        <span className="text-muted-foreground italic">Não atribuído</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {slaInfo.status === 'vencido' && (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        )}
                        {slaInfo.status === 'critico' && (
                          <Clock className="h-4 w-4 text-orange-500" />
                        )}
                        {slaInfo.status === 'atencao' && (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        )}
                        <span className={cn(
                          "text-sm font-medium",
                          slaInfo.status === 'vencido' && "text-red-600",
                          slaInfo.status === 'critico' && "text-orange-500",
                          slaInfo.status === 'atencao' && "text-yellow-600"
                        )}>
                          {formatSlaRestante(slaInfo.minutosRestantes)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ticket.data_abertura), "dd/MM/yy", { locale: ptBR })}
                      {diasSemInteracao >= 3 && (
                        <div className="text-xs text-orange-500 mt-0.5">
                          {diasSemInteracao}d sem interação
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TIPO_LABELS[ticket.tipo] || ticket.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">
                      {ticket.solicitante_nome}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
