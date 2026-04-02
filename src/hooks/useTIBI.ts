import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, differenceInMinutes, differenceInHours, subDays } from "date-fns";
import { useState, useMemo } from "react";

export type PeriodoFiltro = 'hoje' | 'mes' | 'ano' | 'custom';

interface FiltrosBI {
  periodo: PeriodoFiltro;
  dataInicio?: Date;
  dataFim?: Date;
  analistaId: string;
  setor: string;
  prioridade: string;
  status: string;
}

interface Ticket {
  id: string;
  numero: string;
  status: string;
  data_abertura: string;
  data_conclusao: string | null;
  data_ultima_atualizacao: string | null;
  responsavel_ti_id: string | null;
  responsavel_ti_nome: string | null;
  setor_responsavel: string | null;
  setor_nome: string | null;
  nivel_urgencia: 'critica' | 'alta' | 'media' | 'baixa' | null;
  tipo: string;
  sla_resolucao_minutos: number | null;
  descricao: string;
  solicitante_nome: string;
}

export function useTIBI() {
  const [filtros, setFiltros] = useState<FiltrosBI>({
    periodo: 'mes',
    analistaId: '__all__',
    setor: '__all__',
    prioridade: '__all__',
    status: '__all__',
  });

  // Calcular range de datas
  const getDateRange = () => {
    const now = new Date();
    switch (filtros.periodo) {
      case 'hoje':
        return { inicio: startOfDay(now), fim: endOfDay(now) };
      case 'mes':
        return { inicio: startOfMonth(now), fim: endOfMonth(now) };
      case 'ano':
        return { inicio: startOfYear(now), fim: endOfYear(now) };
      case 'custom':
        return {
          inicio: filtros.dataInicio || startOfMonth(now),
          fim: filtros.dataFim || endOfMonth(now),
        };
      default:
        return { inicio: startOfMonth(now), fim: endOfMonth(now) };
    }
  };

  const { inicio, fim } = getDateRange();

  // Query principal - todos tickets do período
  const { data: ticketsPeriodo = [], isLoading } = useQuery({
    queryKey: ['ti-bi-tickets', inicio.toISOString(), fim.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suporte_tickets')
        .select('*')
        .gte('data_abertura', inicio.toISOString())
        .lte('data_abertura', fim.toISOString())
        .order('data_abertura', { ascending: false });

      if (error) throw error;
      return data as Ticket[];
    },
  });

  // Query para todos tickets (backlog atual)
  const { data: todosTickets = [] } = useQuery({
    queryKey: ['ti-bi-todos-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suporte_tickets')
        .select('*')
        .order('data_abertura', { ascending: false });

      if (error) throw error;
      return data as Ticket[];
    },
  });

  // Query para analistas
  const { data: analistas = [] } = useQuery<{ id: string; nome_completo: string | null }[]>({
    queryKey: ['ti-bi-analistas'],
    queryFn: async (): Promise<{ id: string; nome_completo: string | null }[]> => {
      const query = supabase.from('profiles').select('id, nome_completo');
      const { data, error } = await query;

      if (error) throw error;
      
      // Filtrar por setor TI manualmente para evitar erro de type instantiation
      const filtered = (data || []).filter((p: any) => 
        p.setor_nome === 'Tecnologia da Informação'
      );
      
      return filtered.map((p: any) => ({
        id: p.id as string,
        nome_completo: p.nome_completo as string | null,
      }));
    },
  });

  // Aplicar filtros aos tickets
  const ticketsFiltrados = useMemo(() => {
    let result = [...ticketsPeriodo];

    if (filtros.analistaId !== '__all__') {
      result = result.filter(t => t.responsavel_ti_id === filtros.analistaId);
    }
    if (filtros.setor !== '__all__') {
      result = result.filter(t => t.setor_nome === filtros.setor || t.setor_responsavel === filtros.setor);
    }
    if (filtros.prioridade !== '__all__') {
      result = result.filter(t => t.nivel_urgencia === filtros.prioridade);
    }
    if (filtros.status !== '__all__') {
      result = result.filter(t => t.status === filtros.status);
    }

    return result;
  }, [ticketsPeriodo, filtros]);

  // Métricas principais
  const metricas = useMemo(() => {
    const total = ticketsFiltrados.length;
    const abertos = ticketsFiltrados.filter(t => ['aberto', 'pendente'].includes(t.status)).length;
    const emAnalise = ticketsFiltrados.filter(t => ['em_analise', 'aguardando_usuario', 'em_validacao', 'aguardando_confirmacao'].includes(t.status)).length;
    const resolvidos = ticketsFiltrados.filter(t => t.status === 'concluido').length;
    
    // Backlog atual (todos os tickets não concluídos)
    const backlog = todosTickets.filter(t => t.status !== 'concluido').length;

    // Taxa de resolução
    const taxaResolucao = total > 0 ? (resolvidos / total) * 100 : 0;

    // Tempo médio de resolução
    const ticketsComResolucao = ticketsFiltrados.filter(t => t.data_conclusao);
    const tempoMedioMinutos = ticketsComResolucao.length > 0
      ? ticketsComResolucao.reduce((acc, t) => {
          return acc + differenceInMinutes(new Date(t.data_conclusao!), new Date(t.data_abertura));
        }, 0) / ticketsComResolucao.length
      : 0;

    // SLA cumprido vs violado
    const ticketsComSla = ticketsFiltrados.filter(t => t.sla_resolucao_minutos);
    let slaCumprido = 0;
    let slaViolado = 0;
    
    ticketsComSla.forEach(t => {
      if (t.status === 'concluido' && t.data_conclusao) {
        const tempoResolucao = differenceInMinutes(new Date(t.data_conclusao), new Date(t.data_abertura));
        if (tempoResolucao <= (t.sla_resolucao_minutos || Infinity)) {
          slaCumprido++;
        } else {
          slaViolado++;
        }
      } else if (t.status !== 'concluido') {
        // Ticket ainda aberto - verificar se já estourou SLA
        const tempoAberto = differenceInMinutes(new Date(), new Date(t.data_abertura));
        if (tempoAberto > (t.sla_resolucao_minutos || Infinity)) {
          slaViolado++;
        }
      }
    });

    return {
      total,
      abertos,
      emAnalise,
      resolvidos,
      backlog,
      taxaResolucao,
      tempoMedioMinutos,
      slaCumprido,
      slaViolado,
    };
  }, [ticketsFiltrados, todosTickets]);

  // Tickets por status
  const ticketsPorStatus = useMemo(() => {
    const statusMap: Record<string, number> = {};
    ticketsFiltrados.forEach(t => {
      statusMap[t.status] = (statusMap[t.status] || 0) + 1;
    });
    return statusMap;
  }, [ticketsFiltrados]);

  // Tickets por prioridade
  const ticketsPorPrioridade = useMemo(() => {
    const prioMap: Record<string, number> = {
      critica: 0,
      alta: 0,
      media: 0,
      baixa: 0,
      sem_definicao: 0,
    };
    ticketsFiltrados.forEach(t => {
      const prio = t.nivel_urgencia || 'sem_definicao';
      prioMap[prio] = (prioMap[prio] || 0) + 1;
    });
    return prioMap;
  }, [ticketsFiltrados]);

  // Tickets por tipo
  const ticketsPorTipo = useMemo(() => {
    const tipoMap: Record<string, number> = {};
    ticketsFiltrados.forEach(t => {
      tipoMap[t.tipo] = (tipoMap[t.tipo] || 0) + 1;
    });
    return tipoMap;
  }, [ticketsFiltrados]);

  // Tickets por setor solicitante
  const ticketsPorSetor = useMemo(() => {
    const setorMap: Record<string, number> = {};
    ticketsFiltrados.forEach(t => {
      const setor = t.setor_nome || 'Sem setor';
      setorMap[setor] = (setorMap[setor] || 0) + 1;
    });
    return Object.entries(setorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [ticketsFiltrados]);

  // Performance por analista
  const performancePorAnalista = useMemo(() => {
    const analistaMap: Record<string, {
      nome: string;
      resolvidos: number;
      backlog: number;
      tempoMedioMinutos: number;
      ticketsResolvidosList: Ticket[];
    }> = {};

    // Contar resolvidos por analista
    ticketsFiltrados.forEach(t => {
      if (t.responsavel_ti_id && t.responsavel_ti_nome) {
        if (!analistaMap[t.responsavel_ti_id]) {
          analistaMap[t.responsavel_ti_id] = {
            nome: t.responsavel_ti_nome,
            resolvidos: 0,
            backlog: 0,
            tempoMedioMinutos: 0,
            ticketsResolvidosList: [],
          };
        }
        
        if (t.status === 'concluido') {
          analistaMap[t.responsavel_ti_id].resolvidos++;
          analistaMap[t.responsavel_ti_id].ticketsResolvidosList.push(t);
        } else {
          analistaMap[t.responsavel_ti_id].backlog++;
        }
      }
    });

    // Calcular tempo médio
    Object.values(analistaMap).forEach(analista => {
      if (analista.ticketsResolvidosList.length > 0) {
        const tempoTotal = analista.ticketsResolvidosList.reduce((acc, t) => {
          return acc + differenceInMinutes(new Date(t.data_conclusao!), new Date(t.data_abertura));
        }, 0);
        analista.tempoMedioMinutos = tempoTotal / analista.ticketsResolvidosList.length;
      }
    });

    return Object.entries(analistaMap)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.resolvidos - a.resolvidos);
  }, [ticketsFiltrados]);

  // Tickets reabertos (simplificado - tickets que foram para concluido e voltaram)
  const ticketsReabertos = useMemo(() => {
    // Por enquanto retorna 0, precisaria de histórico mais detalhado
    return 0;
  }, [ticketsFiltrados]);

  // SLA e Gargalos
  const slaEGargalos = useMemo(() => {
    const agora = new Date();
    
    const slaVencido = todosTickets.filter(t => {
      if (t.status === 'concluido' || !t.sla_resolucao_minutos) return false;
      const tempoAberto = differenceInMinutes(agora, new Date(t.data_abertura));
      return tempoAberto > t.sla_resolucao_minutos;
    });

    const slaProximoVencimento = todosTickets.filter(t => {
      if (t.status === 'concluido' || !t.sla_resolucao_minutos) return false;
      const tempoAberto = differenceInMinutes(agora, new Date(t.data_abertura));
      const percentual = (tempoAberto / t.sla_resolucao_minutos) * 100;
      return percentual >= 75 && percentual < 100;
    });

    const semInteracao48h = todosTickets.filter(t => {
      if (t.status === 'concluido') return false;
      const ultimaAtualizacao = t.data_ultima_atualizacao 
        ? new Date(t.data_ultima_atualizacao) 
        : new Date(t.data_abertura);
      const horasSemInteracao = differenceInHours(agora, ultimaAtualizacao);
      return horasSemInteracao >= 48;
    });

    // Gargalos por status (status com mais tickets parados)
    const gargalosPorStatus = Object.entries(ticketsPorStatus)
      .filter(([status]) => status !== 'concluido')
      .sort((a, b) => b[1] - a[1]);

    return {
      slaVencido,
      slaProximoVencimento,
      semInteracao48h,
      gargalosPorStatus,
    };
  }, [todosTickets, ticketsPorStatus]);

  // Setores únicos para filtro
  const setoresUnicos = useMemo(() => {
    const setores = new Set<string>();
    todosTickets.forEach(t => {
      if (t.setor_nome) setores.add(t.setor_nome);
    });
    return Array.from(setores).sort();
  }, [todosTickets]);

  return {
    filtros,
    setFiltros,
    isLoading,
    metricas,
    ticketsPorStatus,
    ticketsPorPrioridade,
    ticketsPorTipo,
    ticketsPorSetor,
    performancePorAnalista,
    ticketsReabertos,
    slaEGargalos,
    analistas,
    setoresUnicos,
    ticketsFiltrados,
    inicio,
    fim,
  };
}
