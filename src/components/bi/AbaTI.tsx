import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, CheckCircle, Clock, TrendingUp, AlertTriangle, Users, 
  Inbox, Target, Timer, AlertCircle, Calendar, Filter
} from "lucide-react";
import { useTIBI, PeriodoFiltro } from "@/hooks/useTIBI";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  aberto: "bg-gray-500",
  pendente: "bg-gray-400",
  em_analise: "bg-blue-500",
  aguardando_usuario: "bg-orange-500",
  em_validacao: "bg-purple-500",
  aguardando_confirmacao: "bg-cyan-500",
  concluido: "bg-green-500",
};

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string }> = {
  critica: { label: "Crítica", color: "bg-red-600 text-white" },
  alta: { label: "Alta", color: "bg-orange-500 text-white" },
  media: { label: "Média", color: "bg-yellow-500 text-black" },
  baixa: { label: "Baixa", color: "bg-green-500 text-white" },
  sem_definicao: { label: "Sem Definição", color: "bg-gray-400 text-white" },
};

const TIPO_LABELS: Record<string, string> = {
  software: "Incidente",
  hardware: "Solicitação",
};

export function AbaTI() {
  const {
    filtros,
    setFiltros,
    isLoading,
    metricas,
    ticketsPorStatus,
    ticketsPorPrioridade,
    ticketsPorTipo,
    ticketsPorSetor,
    performancePorAnalista,
    slaEGargalos,
    analistas,
    setoresUnicos,
    inicio,
    fim,
  } = useTIBI();

  const formatarTempo = (minutos: number) => {
    if (minutos < 60) return `${Math.round(minutos)} min`;
    if (minutos < 1440) return `${(minutos / 60).toFixed(1)}h`;
    return `${(minutos / 1440).toFixed(1)}d`;
  };

  const getPeriodoLabel = () => {
    switch (filtros.periodo) {
      case 'hoje':
        return format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'mes':
        return format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
      case 'ano':
        return format(new Date(), "yyyy", { locale: ptBR });
      default:
        return `${format(inicio, 'dd/MM/yyyy')} - ${format(fim, 'dd/MM/yyyy')}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros Globais */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Filtros</CardTitle>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Período */}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Tabs 
                  value={filtros.periodo} 
                  onValueChange={(v) => setFiltros(f => ({ ...f, periodo: v as PeriodoFiltro }))}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="hoje" className="text-xs px-2">Hoje</TabsTrigger>
                    <TabsTrigger value="mes" className="text-xs px-2">Mês</TabsTrigger>
                    <TabsTrigger value="ano" className="text-xs px-2">Ano</TabsTrigger>
                  </TabsList>
                </Tabs>
                <span className="text-xs text-muted-foreground hidden md:inline">{getPeriodoLabel()}</span>
              </div>

              {/* Analista */}
              <Select 
                value={filtros.analistaId} 
                onValueChange={(v) => setFiltros(f => ({ ...f, analistaId: v }))}
              >
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Analista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos Analistas</SelectItem>
                  {analistas.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.nome_completo || 'Sem nome'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Setor */}
              <Select 
                value={filtros.setor} 
                onValueChange={(v) => setFiltros(f => ({ ...f, setor: v }))}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos Setores</SelectItem>
                  {setoresUnicos.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Prioridade */}
              <Select 
                value={filtros.prioridade} 
                onValueChange={(v) => setFiltros(f => ({ ...f, prioridade: v }))}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas Prioridades</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="baixa">Baixa</SelectItem>
                </SelectContent>
              </Select>

              {/* Status */}
              <Select 
                value={filtros.status} 
                onValueChange={(v) => setFiltros(f => ({ ...f, status: v }))}
              >
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Visão Geral - Cards KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Total</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricas.total}</div>
            <p className="text-xs text-muted-foreground">tickets no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Abertos</CardTitle>
            <Inbox className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{metricas.abertos}</div>
            <p className="text-xs text-muted-foreground">aguardando análise</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Resolvidos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metricas.resolvidos}</div>
            <p className="text-xs text-muted-foreground">no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Backlog</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{metricas.backlog}</div>
            <p className="text-xs text-muted-foreground">total pendente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Taxa Resolução</CardTitle>
            <Target className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-500">
              {metricas.taxaResolucao.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">do período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Tempo Médio</CardTitle>
            <Timer className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">
              {formatarTempo(metricas.tempoMedioMinutos)}
            </div>
            <p className="text-xs text-muted-foreground">resolução</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">SLA</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-green-600">{metricas.slaCumprido}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-lg font-bold text-red-600">{metricas.slaViolado}</span>
            </div>
            <p className="text-xs text-muted-foreground">cumprido/violado</p>
          </CardContent>
        </Card>
      </div>

      {/* Seção Operacional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets por Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Tickets por Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const count = ticketsPorStatus[status] || 0;
              const total = metricas.total || 1;
              const percentual = (count / total) * 100;
              
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", STATUS_COLORS[status])} />
                      {label}
                    </span>
                    <span className="font-medium">{count} ({percentual.toFixed(0)}%)</span>
                  </div>
                  <Progress value={percentual} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Tickets por Prioridade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Tickets por Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(PRIORIDADE_CONFIG).map(([prio, config]) => {
              const count = ticketsPorPrioridade[prio] || 0;
              const total = metricas.total || 1;
              const percentual = (count / total) * 100;
              
              return (
                <div key={prio} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Badge className={cn("text-xs", config.color)}>{config.label}</Badge>
                    <span className="font-medium">{count} ({percentual.toFixed(0)}%)</span>
                  </div>
                  <Progress value={percentual} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Tickets por Tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tickets por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {Object.entries(ticketsPorTipo).map(([tipo, count]) => (
                <div key={tipo} className="flex-1 text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{count}</div>
                  <p className="text-sm text-muted-foreground">{TIPO_LABELS[tipo] || tipo}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tickets por Setor Solicitante */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 Setores Solicitantes</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {ticketsPorSetor.map(([setor, count], index) => (
                  <div key={setor} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                    <span className="text-sm flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">#{index + 1}</span>
                      {setor}
                    </span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Performance do Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Performance por Analista
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Analista</th>
                  <th className="text-center py-2 font-medium">Resolvidos</th>
                  <th className="text-center py-2 font-medium">Backlog</th>
                  <th className="text-center py-2 font-medium">Tempo Médio</th>
                </tr>
              </thead>
              <tbody>
                {performancePorAnalista.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-muted-foreground">
                      Nenhum dado disponível
                    </td>
                  </tr>
                ) : (
                  performancePorAnalista.map((analista, index) => (
                    <tr key={analista.id} className="border-b last:border-0">
                      <td className="py-3 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">#{index + 1}</span>
                        {analista.nome}
                      </td>
                      <td className="text-center py-3">
                        <Badge className="bg-green-500 text-white">{analista.resolvidos}</Badge>
                      </td>
                      <td className="text-center py-3">
                        <Badge variant="secondary">{analista.backlog}</Badge>
                      </td>
                      <td className="text-center py-3">
                        {formatarTempo(analista.tempoMedioMinutos)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* SLA e Gargalos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SLA Vencido */}
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              SLA Vencido ({slaEGargalos.slaVencido.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {slaEGargalos.slaVencido.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum ticket com SLA vencido 🎉
                </p>
              ) : (
                <div className="space-y-2">
                  {slaEGargalos.slaVencido.slice(0, 10).map(ticket => (
                    <div key={ticket.id} className="p-2 bg-red-50 rounded text-sm">
                      <span className="font-medium">{ticket.numero}</span>
                      <p className="text-xs text-muted-foreground truncate">{ticket.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Próximo do Vencimento */}
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-orange-500">
              <Clock className="h-4 w-4" />
              Próximo Vencimento ({slaEGargalos.slaProximoVencimento.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {slaEGargalos.slaProximoVencimento.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum ticket próximo do vencimento
                </p>
              ) : (
                <div className="space-y-2">
                  {slaEGargalos.slaProximoVencimento.slice(0, 10).map(ticket => (
                    <div key={ticket.id} className="p-2 bg-orange-50 rounded text-sm">
                      <span className="font-medium">{ticket.numero}</span>
                      <p className="text-xs text-muted-foreground truncate">{ticket.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Sem Interação > 48h */}
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-600">
              <Timer className="h-4 w-4" />
              Sem Interação +48h ({slaEGargalos.semInteracao48h.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {slaEGargalos.semInteracao48h.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Todos os tickets têm interação recente
                </p>
              ) : (
                <div className="space-y-2">
                  {slaEGargalos.semInteracao48h.slice(0, 10).map(ticket => (
                    <div key={ticket.id} className="p-2 bg-yellow-50 rounded text-sm">
                      <span className="font-medium">{ticket.numero}</span>
                      <p className="text-xs text-muted-foreground truncate">{ticket.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Gargalos por Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gargalos por Status (Tickets Pendentes)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {slaEGargalos.gargalosPorStatus.map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <div className={cn("w-3 h-3 rounded-full", STATUS_COLORS[status])} />
                <span className="text-sm">{STATUS_LABELS[status] || status}</span>
                <Badge variant="secondary" className="ml-2">{count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
