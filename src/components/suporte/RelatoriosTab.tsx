import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, CheckCircle, Clock, TrendingUp, Calendar } from "lucide-react";
import { format, subDays, subMonths, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

type PeriodoFiltro = 'dia' | 'mes' | 'ano';

export function RelatoriosTab() {
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('mes');

  // Calcular datas baseado no filtro
  const getDateRange = () => {
    const now = new Date();
    switch (periodoFiltro) {
      case 'dia':
        return {
          inicio: startOfDay(now),
          fim: endOfDay(now)
        };
      case 'mes':
        return {
          inicio: startOfMonth(now),
          fim: endOfMonth(now)
        };
      case 'ano':
        return {
          inicio: startOfYear(now),
          fim: endOfYear(now)
        };
      default:
        return {
          inicio: startOfMonth(now),
          fim: endOfMonth(now)
        };
    }
  };

  const { inicio, fim } = getDateRange();

  // Query para tickets do período
  const { data: ticketsPeriodo = [] } = useQuery({
    queryKey: ['relatorio-tickets-periodo', periodoFiltro, inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suporte_tickets')
        .select('*')
        .gte('data_abertura', inicio.toISOString())
        .lte('data_abertura', fim.toISOString())
        .order('data_abertura', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Query para tickets resolvidos hoje
  const { data: ticketsResolvidosHoje = [] } = useQuery({
    queryKey: ['relatorio-tickets-resolvidos-hoje'],
    queryFn: async () => {
      const hoje = startOfDay(new Date());
      const { data, error } = await supabase
        .from('suporte_tickets')
        .select('*')
        .eq('status', 'concluido')
        .gte('data_conclusao', hoje.toISOString())
        .order('data_conclusao', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Calcular métricas
  const totalTickets = ticketsPeriodo.length;
  const ticketsResolvidos = ticketsPeriodo.filter(t => t.status === 'concluido').length;
  const ticketsEmAnalise = ticketsPeriodo.filter(t => 
    ['em_analise', 'aguardando_usuario', 'em_validacao', 'aguardando_confirmacao'].includes(t.status)
  ).length;
  const ticketsPendentes = ticketsPeriodo.filter(t => 
    ['aberto', 'pendente'].includes(t.status)
  ).length;

  // Calcular média de resolução (em horas)
  const ticketsComResolucao = ticketsPeriodo.filter(t => t.data_conclusao);
  const mediaResolucao = ticketsComResolucao.length > 0
    ? ticketsComResolucao.reduce((acc, ticket) => {
        const abertura = new Date(ticket.data_abertura);
        const conclusao = new Date(ticket.data_conclusao!);
        const diffHoras = (conclusao.getTime() - abertura.getTime()) / (1000 * 60 * 60);
        return acc + diffHoras;
      }, 0) / ticketsComResolucao.length
    : 0;

  const formatarMediaResolucao = () => {
    if (mediaResolucao < 1) {
      return `${Math.round(mediaResolucao * 60)} minutos`;
    } else if (mediaResolucao < 24) {
      return `${mediaResolucao.toFixed(1)} horas`;
    } else {
      return `${(mediaResolucao / 24).toFixed(1)} dias`;
    }
  };

  const taxaResolucao = totalTickets > 0 
    ? ((ticketsResolvidos / totalTickets) * 100).toFixed(1)
    : 0;

  const getPeriodoLabel = () => {
    switch (periodoFiltro) {
      case 'dia':
        return format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      case 'mes':
        return format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
      case 'ano':
        return format(new Date(), "yyyy", { locale: ptBR });
    }
  };

  return (
    <div className="space-y-6">
      {/* Filtros de Período */}
      <div className="flex items-center gap-4">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <Tabs value={periodoFiltro} onValueChange={(v) => setPeriodoFiltro(v as PeriodoFiltro)}>
          <TabsList>
            <TabsTrigger value="dia">Hoje</TabsTrigger>
            <TabsTrigger value="mes">Este Mês</TabsTrigger>
            <TabsTrigger value="ano">Este Ano</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-sm text-muted-foreground">
          {getPeriodoLabel()}
        </span>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Tickets
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTickets}</div>
            <p className="text-xs text-muted-foreground">
              {periodoFiltro === 'dia' ? 'Abertos hoje' : 
               periodoFiltro === 'mes' ? 'Abertos este mês' : 
               'Abertos este ano'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tickets Resolvidos
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{ticketsResolvidos}</div>
            <p className="text-xs text-muted-foreground">
              Taxa de resolução: {taxaResolucao}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Em Análise
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{ticketsEmAnalise}</div>
            <p className="text-xs text-muted-foreground">
              Pendentes: {ticketsPendentes}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tempo Médio de Resolução
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatarMediaResolucao()}
            </div>
            <p className="text-xs text-muted-foreground">
              Baseado em {ticketsComResolucao.length} tickets
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card de Tickets Resolvidos Hoje */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Tickets Resolvidos Hoje ({ticketsResolvidosHoje.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticketsResolvidosHoje.length > 0 ? (
            <div className="space-y-2">
              {ticketsResolvidosHoje.map(ticket => (
                <div 
                  key={ticket.id} 
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{ticket.numero}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-md">
                      {ticket.descricao}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      Resolvido às {format(new Date(ticket.data_conclusao!), 'HH:mm')}
                    </p>
                    <p className="text-xs text-green-700 font-medium">
                      {ticket.resolvido_por_nome || ticket.solicitante_nome}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum ticket foi resolvido hoje ainda
            </p>
          )}
        </CardContent>
      </Card>

      {/* Distribuição por Status */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição de Status - {getPeriodoLabel()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { status: 'concluido', label: 'Concluídos', color: 'bg-green-500' },
              { status: 'em_analise', label: 'Em Análise', color: 'bg-blue-500' },
              { status: 'aguardando_usuario', label: 'Aguardando Usuário', color: 'bg-orange-500' },
              { status: 'em_validacao', label: 'Em Validação', color: 'bg-purple-500' },
              { status: 'aguardando_confirmacao', label: 'Aguardando Confirmação', color: 'bg-cyan-500' },
              { status: 'pendente', label: 'Pendentes', color: 'bg-yellow-500' },
              { status: 'aberto', label: 'Abertos', color: 'bg-gray-500' },
            ].map(({ status, label, color }) => {
              const count = ticketsPeriodo.filter(t => t.status === status).length;
              const percentual = totalTickets > 0 ? (count / totalTickets) * 100 : 0;
              
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{label}</span>
                    <span className="font-medium">{count} ({percentual.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${color} transition-all duration-300`}
                      style={{ width: `${percentual}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
