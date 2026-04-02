import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, addMonths, differenceInDays, parseISO, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "ano" | "personalizado";

interface Contrato {
  id: string;
  valor_estimado: number | null;
  status_contrato: string | null;
  tipo_servico: string[] | null;
  data_fim: string;
  data_inicio: string;
  created_at: string;
  codigo_interno: number | null;
  clientes?: { nome_empresa: string } | null;
}

export interface AlertaEstrategico {
  id: string;
  tipo: 'risco' | 'oportunidade' | 'atencao';
  titulo: string;
  descricao: string;
  valor?: number;
  acao?: string;
}

export function useContratosBI() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("trimestre");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tipoServicoFiltro, setTipoServicoFiltro] = useState("all");
  const [clienteFiltro, setClienteFiltro] = useState("all");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [faixaValorFiltro, setFaixaValorFiltro] = useState("all");
  const [somenteAtivos, setSomenteAtivos] = useState(false);
  const [metricaTipoServico, setMetricaTipoServico] = useState<'valor' | 'quantidade'>('valor');

  // Calculate date range based on quick period selection
  const dateRange = useMemo(() => {
    const hoje = new Date();
    
    switch (periodoRapido) {
      case "mes_atual":
        return {
          inicio: startOfMonth(hoje),
          fim: endOfMonth(hoje)
        };
      case "mes_anterior":
        const mesAnterior = subMonths(hoje, 1);
        return {
          inicio: startOfMonth(mesAnterior),
          fim: endOfMonth(mesAnterior)
        };
      case "trimestre":
        return {
          inicio: startOfMonth(subMonths(hoje, 2)),
          fim: endOfMonth(hoje)
        };
      case "semestre":
        return {
          inicio: startOfMonth(subMonths(hoje, 5)),
          fim: endOfMonth(hoje)
        };
      case "ano":
        return {
          inicio: startOfMonth(subMonths(hoje, 11)),
          fim: endOfMonth(hoje)
        };
      case "personalizado":
        return {
          inicio: dataInicio ? parseISO(dataInicio) : null,
          fim: dataFim ? parseISO(dataFim) : null
        };
      default:
        return { inicio: null, fim: null };
    }
  }, [periodoRapido, dataInicio, dataFim]);

  // Fetch all contracts
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos-bi-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contratos')
        .select('*, clientes(nome_empresa)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Contrato[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Get unique clients and service types for filters
  const filterOptions = useMemo(() => {
    const clientes = new Set<string>();
    const tiposServico = new Set<string>();
    const statusList = new Set<string>();
    
    contratos.forEach(c => {
      if (c.clientes?.nome_empresa) clientes.add(c.clientes.nome_empresa);
      if (c.tipo_servico) c.tipo_servico.forEach(t => tiposServico.add(t));
      if (c.status_contrato) statusList.add(c.status_contrato);
    });
    
    return {
      clientes: Array.from(clientes).sort(),
      tiposServico: Array.from(tiposServico).sort(),
      status: Array.from(statusList).sort()
    };
  }, [contratos]);

  // Filter contracts based on all filters
  const filteredContratos = useMemo(() => {
    return contratos.filter(c => {
      // Date filter - based on contract creation or activity
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(c.created_at);
        const dataFimContrato = new Date(c.data_fim);
        const dataInicioContrato = new Date(c.data_inicio);
        
        // Include if contract was created, started, or ends within the period
        const inRange = createdAt >= dateRange.inicio && createdAt <= dateRange.fim;
        const activeInPeriod = dataInicioContrato <= dateRange.fim && dataFimContrato >= dateRange.inicio;
        
        if (!inRange && !activeInPeriod) return false;
      }
      
      // Service type filter
      if (tipoServicoFiltro !== "all") {
        if (!c.tipo_servico?.includes(tipoServicoFiltro)) return false;
      }
      
      // Client filter
      if (clienteFiltro !== "all") {
        if (c.clientes?.nome_empresa !== clienteFiltro) return false;
      }

      // Status filter
      if (statusFiltro !== "all") {
        if (c.status_contrato !== statusFiltro) return false;
      }

      // Somente ativos
      if (somenteAtivos) {
        if (c.status_contrato !== 'Ativo') return false;
      }

      // Faixa de valor
      if (faixaValorFiltro !== "all") {
        const valor = Number(c.valor_estimado) || 0;
        switch (faixaValorFiltro) {
          case "ate_10k":
            if (valor > 10000) return false;
            break;
          case "10k_50k":
            if (valor < 10000 || valor > 50000) return false;
            break;
          case "50k_100k":
            if (valor < 50000 || valor > 100000) return false;
            break;
          case "100k_500k":
            if (valor < 100000 || valor > 500000) return false;
            break;
          case "acima_500k":
            if (valor < 500000) return false;
            break;
        }
      }
      
      return true;
    });
  }, [contratos, dateRange, tipoServicoFiltro, clienteFiltro, statusFiltro, faixaValorFiltro, somenteAtivos]);

  // Previous period contracts for comparison
  const previousPeriodContratos = useMemo(() => {
    if (!dateRange.inicio || !dateRange.fim) return [];
    
    const periodLength = differenceInDays(dateRange.fim, dateRange.inicio);
    const prevStart = subDays(dateRange.inicio, periodLength + 1);
    const prevEnd = subDays(dateRange.inicio, 1);
    
    return contratos.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt >= prevStart && createdAt <= prevEnd;
    });
  }, [contratos, dateRange]);

  // Contracts by status for quick access
  const contratosPorStatus = useMemo(() => {
    const hoje = new Date();
    
    const ativos = contratos.filter(c => c.status_contrato === 'Ativo');
    const inativos = contratos.filter(c => c.status_contrato === 'Inativo');
    const encerrados = contratos.filter(c => c.status_contrato === 'Encerrado');
    const suspensos = contratos.filter(c => c.status_contrato === 'Suspenso');
    const emRenovacao = contratos.filter(c => 
      c.status_contrato === 'Em Renovação' || c.status_contrato === 'Em Processo de Renovação'
    );
    const vencidos = contratos.filter(c => new Date(c.data_fim) < hoje && c.status_contrato === 'Ativo');
    
    return { ativos, inativos, encerrados, suspensos, emRenovacao, vencidos };
  }, [contratos]);

  // KPIs estratégicos
  const kpis = useMemo(() => {
    const hoje = new Date();
    const em30Dias = addMonths(hoje, 1);
    
    const { ativos, inativos, vencidos, encerrados } = contratosPorStatus;
    
    // Valor por status
    const valorAtivos = ativos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    const valorInativos = inativos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    
    // Contratos a vencer em 30 dias
    const contratosVencer30 = filteredContratos.filter(c => {
      const dataFim = new Date(c.data_fim);
      return dataFim >= hoje && dataFim <= em30Dias && c.status_contrato === 'Ativo';
    });
    const valorVencer30 = contratosVencer30.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    
    // Valor Vencido
    const valorVencido = vencidos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    
    // Valor em Risco = Vencidos + A vencer 30 dias
    const valorEmRisco = valorVencido + valorVencer30;
    const qtdEmRisco = vencidos.length + contratosVencer30.length;
    
    // Ticket Médio (apenas ativos)
    const ticketMedio = ativos.length > 0 ? valorAtivos / ativos.length : 0;
    
    // Encerrados no período (churn)
    const encerradosNoPeriodo = encerrados.filter(c => {
      if (!dateRange.inicio || !dateRange.fim) return false;
      const dataFim = new Date(c.data_fim);
      return dataFim >= dateRange.inicio && dataFim <= dateRange.fim;
    });
    
    // Concentração de Receita - Top 3 contratos
    const sortedByValue = [...ativos].sort((a, b) => 
      (Number(b.valor_estimado) || 0) - (Number(a.valor_estimado) || 0)
    );
    const top3Valor = sortedByValue.slice(0, 3).reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    const concentracaoTop3 = valorAtivos > 0 ? (top3Valor / valorAtivos) * 100 : 0;
    
    // Previous period comparison
    const valorTotalAnterior = previousPeriodContratos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    const ticketMedioAnterior = previousPeriodContratos.length > 0 
      ? valorTotalAnterior / previousPeriodContratos.length 
      : 0;
    
    const variacaoValor = valorTotalAnterior > 0 
      ? ((valorAtivos - valorTotalAnterior) / valorTotalAnterior) * 100 
      : 0;
    const variacaoTicket = ticketMedioAnterior > 0 
      ? ((ticketMedio - ticketMedioAnterior) / ticketMedioAnterior) * 100 
      : 0;
    const variacaoQuantidade = previousPeriodContratos.length > 0 
      ? ((ativos.length - previousPeriodContratos.length) / previousPeriodContratos.length) * 100 
      : 0;
    
    return {
      valorAtivos,
      valorInativos,
      valorEmRisco,
      qtdEmRisco,
      ticketMedio,
      totalAtivos: ativos.length,
      totalEncerradosPeriodo: encerradosNoPeriodo.length,
      concentracaoTop3,
      valorVencer30,
      qtdVencer30: contratosVencer30.length,
      valorVencido,
      qtdVencidos: vencidos.length,
      variacaoValor,
      variacaoTicket,
      variacaoQuantidade
    };
  }, [filteredContratos, contratosPorStatus, previousPeriodContratos, dateRange]);

  // Service type distribution with period comparison
  const tipoServicoData = useMemo(() => {
    const aggregatedCurrent: Record<string, { quantidade: number; valor: number }> = {};
    const aggregatedPrevious: Record<string, { quantidade: number; valor: number }> = {};
    
    filteredContratos.forEach(c => {
      if (c.tipo_servico && Array.isArray(c.tipo_servico)) {
        c.tipo_servico.forEach((tipo: string) => {
          if (!aggregatedCurrent[tipo]) aggregatedCurrent[tipo] = { quantidade: 0, valor: 0 };
          aggregatedCurrent[tipo].quantidade += 1;
          aggregatedCurrent[tipo].valor += Number(c.valor_estimado) || 0;
        });
      }
    });

    previousPeriodContratos.forEach(c => {
      if (c.tipo_servico && Array.isArray(c.tipo_servico)) {
        c.tipo_servico.forEach((tipo: string) => {
          if (!aggregatedPrevious[tipo]) aggregatedPrevious[tipo] = { quantidade: 0, valor: 0 };
          aggregatedPrevious[tipo].quantidade += 1;
          aggregatedPrevious[tipo].valor += Number(c.valor_estimado) || 0;
        });
      }
    });
    
    const total = Object.values(aggregatedCurrent).reduce((sum, v) => sum + v.valor, 0);
    const totalQtd = Object.values(aggregatedCurrent).reduce((sum, v) => sum + v.quantidade, 0);
    
    return Object.entries(aggregatedCurrent)
      .map(([tipo, data]) => {
        const prev = aggregatedPrevious[tipo] || { quantidade: 0, valor: 0 };
        const variacaoValor = prev.valor > 0 ? ((data.valor - prev.valor) / prev.valor) * 100 : 0;
        const variacaoQtd = prev.quantidade > 0 ? ((data.quantidade - prev.quantidade) / prev.quantidade) * 100 : 0;
        
        return {
          tipo,
          valor: data.valor,
          valorAnterior: prev.valor,
          quantidade: data.quantidade,
          quantidadeAnterior: prev.quantidade,
          percentual: total > 0 ? (data.valor / total) * 100 : 0,
          percentualQtd: totalQtd > 0 ? (data.quantidade / totalQtd) * 100 : 0,
          variacaoValor,
          variacaoQtd
        };
      })
      .sort((a, b) => metricaTipoServico === 'valor' ? b.valor - a.valor : b.quantidade - a.quantidade);
  }, [filteredContratos, previousPeriodContratos, metricaTipoServico]);

  // Status data with all status types
  const statusData = useMemo(() => {
    const hoje = new Date();
    const allStatus = ['Ativo', 'Inativo', 'Encerrado', 'Suspenso', 'Em Renovação', 'Vencido', 'Pre-Contrato'];
    const counts: Record<string, { count: number; valor: number }> = {};
    const prevCounts: Record<string, number> = {};
    
    // Initialize all status
    allStatus.forEach(status => {
      counts[status] = { count: 0, valor: 0 };
    });
    
    filteredContratos.forEach(c => {
      let status = c.status_contrato || 'Não informado';
      
      // Mark as "Vencido" if date passed and still active
      if (c.status_contrato === 'Ativo' && new Date(c.data_fim) < hoje) {
        status = 'Vencido';
      }
      
      if (!counts[status]) counts[status] = { count: 0, valor: 0 };
      counts[status].count += 1;
      counts[status].valor += Number(c.valor_estimado) || 0;
    });
    
    previousPeriodContratos.forEach(c => {
      const status = c.status_contrato || 'Não informado';
      prevCounts[status] = (prevCounts[status] || 0) + 1;
    });
    
    const total = Object.values(counts).reduce((sum, v) => sum + v.count, 0);
    
    return Object.entries(counts)
      .filter(([_, data]) => data.count > 0)
      .map(([status, data]) => {
        const prevCount = prevCounts[status] || 0;
        const variacao = prevCount > 0 ? ((data.count - prevCount) / prevCount) * 100 : 0;
        
        return {
          status,
          count: data.count,
          valor: data.valor,
          percentual: total > 0 ? (data.count / total) * 100 : 0,
          variacao
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [filteredContratos, previousPeriodContratos]);

  // Monthly evolution with multiple lines and enhanced tooltip data
  const evolucaoMensal = useMemo(() => {
    const months: Record<string, { 
      ativos: number; 
      encerrados: number; 
      valorTotal: number;
      date: Date 
    }> = {};
    
    // Process all contracts
    contratos.forEach(c => {
      const date = new Date(c.created_at);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { ativos: 0, encerrados: 0, valorTotal: 0, date };
      }
      
      if (c.status_contrato === 'Ativo') {
        months[monthKey].ativos += 1;
      } else if (c.status_contrato === 'Encerrado') {
        months[monthKey].encerrados += 1;
      }
      months[monthKey].valorTotal += Number(c.valor_estimado) || 0;
    });
    
    // Sort and convert to array
    const sorted = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
    
    const data = sorted.map(([key, val], index, arr) => {
      const totalMes = val.ativos + val.encerrados;
      const ticketMedioMes = totalMes > 0 ? val.valorTotal / totalMes : 0;
      
      return {
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        ativos: val.ativos,
        encerrados: val.encerrados,
        total: totalMes,
        valorTotal: val.valorTotal,
        ticketMedio: ticketMedioMes,
        isProjection: false
      };
    });
    
    // Add 2-month projection
    if (data.length >= 3) {
      const recentData = data.slice(-6);
      const n = recentData.length;
      
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      recentData.forEach((d, i) => {
        sumX += i;
        sumY += d.ativos;
        sumXY += i * d.ativos;
        sumX2 += i * i;
      });
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      for (let i = 1; i <= 2; i++) {
        const projectedDate = addMonths(new Date(), i);
        const projectedValue = Math.max(0, Math.round(intercept + slope * (n + i - 1)));
        
        data.push({
          mes: format(projectedDate, 'MMM/yy', { locale: ptBR }),
          ativos: projectedValue,
          encerrados: 0,
          total: projectedValue,
          valorTotal: 0,
          ticketMedio: 0,
          isProjection: true
        });
      }
    }
    
    return data;
  }, [contratos]);

  // Contracts about to expire
  const contratosVencer = useMemo(() => {
    const hoje = new Date();
    const em60Dias = addMonths(hoje, 2);
    const valorTotal = contratosPorStatus.ativos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    
    return contratosPorStatus.ativos
      .filter(c => {
        const dataFim = new Date(c.data_fim);
        return dataFim >= hoje && dataFim <= em60Dias;
      })
      .map(c => {
        const dataFim = new Date(c.data_fim);
        const diasRestantes = differenceInDays(dataFim, hoje);
        const valor = Number(c.valor_estimado) || 0;
        
        return {
          id: c.id,
          cliente: c.clientes?.nome_empresa || 'Sem cliente',
          dataFim: c.data_fim,
          valor,
          percentual: valorTotal > 0 ? (valor / valorTotal) * 100 : 0,
          diasRestantes,
          urgencia: diasRestantes < 15 ? 'critico' : diasRestantes < 30 ? 'alerta' : 'normal'
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 10);
  }, [contratosPorStatus.ativos]);

  // Top contracts by value with percentage and status highlight
  const topContratos = useMemo(() => {
    const valorTotal = contratosPorStatus.ativos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
    
    return [...filteredContratos]
      .sort((a, b) => (Number(b.valor_estimado) || 0) - (Number(a.valor_estimado) || 0))
      .slice(0, 10)
      .map((c, index) => {
        const valor = Number(c.valor_estimado) || 0;
        return {
          posicao: index + 1,
          id: c.id,
          codigo: c.codigo_interno,
          cliente: c.clientes?.nome_empresa || 'Sem cliente',
          valor,
          status: c.status_contrato || 'N/A',
          percentualTotal: valorTotal > 0 ? (valor / valorTotal) * 100 : 0,
          isInativo: c.status_contrato !== 'Ativo'
        };
      });
  }, [filteredContratos, contratosPorStatus.ativos]);

  // Alertas Estratégicos
  const alertas = useMemo((): AlertaEstrategico[] => {
    const alertasList: AlertaEstrategico[] = [];
    const hoje = new Date();
    
    // 1. Contratos vencidos há mais de 7 dias
    const vencidosAntigos = contratosPorStatus.vencidos.filter(c => {
      const diasVencido = differenceInDays(hoje, new Date(c.data_fim));
      return diasVencido > 7;
    });
    if (vencidosAntigos.length > 0) {
      const valorVencido = vencidosAntigos.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
      alertasList.push({
        id: 'vencidos-antigos',
        tipo: 'risco',
        titulo: `${vencidosAntigos.length} contratos vencidos há mais de 7 dias`,
        descricao: `Valor total em risco: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorVencido)}`,
        valor: valorVencido,
        acao: 'Revisar contratos vencidos'
      });
    }
    
    // 2. Contratos a vencer em 30 dias
    if (kpis.qtdVencer30 > 0) {
      alertasList.push({
        id: 'vencer-30',
        tipo: 'atencao',
        titulo: `${kpis.qtdVencer30} contratos vencem em até 30 dias`,
        descricao: `Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis.valorVencer30)}`,
        valor: kpis.valorVencer30,
        acao: 'Iniciar renovação'
      });
    }
    
    // 3. Concentração de receita alta (>40%)
    if (kpis.concentracaoTop3 > 40) {
      alertasList.push({
        id: 'concentracao-alta',
        tipo: 'risco',
        titulo: 'Alta concentração de receita',
        descricao: `Top 3 contratos representam ${kpis.concentracaoTop3.toFixed(1)}% do faturamento`,
        acao: 'Diversificar carteira'
      });
    }
    
    // 4. Queda de ticket médio
    if (kpis.variacaoTicket < -10) {
      alertasList.push({
        id: 'queda-ticket',
        tipo: 'atencao',
        titulo: 'Queda no Ticket Médio',
        descricao: `Redução de ${Math.abs(kpis.variacaoTicket).toFixed(1)}% comparado ao período anterior`,
        acao: 'Analisar precificação'
      });
    }
    
    // 5. Crescimento expressivo de tipo de serviço (oportunidade)
    const tipoEmCrescimento = tipoServicoData.find(t => t.variacaoValor > 30 && t.valor > 10000);
    if (tipoEmCrescimento) {
      alertasList.push({
        id: 'crescimento-servico',
        tipo: 'oportunidade',
        titulo: `Crescimento em ${tipoEmCrescimento.tipo}`,
        descricao: `Aumento de ${tipoEmCrescimento.variacaoValor.toFixed(1)}% no período`,
        valor: tipoEmCrescimento.valor,
        acao: 'Explorar oportunidade'
      });
    }
    
    // 6. Muitos contratos inativos de alto valor
    const inativosAltoValor = contratosPorStatus.inativos.filter(c => (Number(c.valor_estimado) || 0) > 50000);
    if (inativosAltoValor.length >= 3) {
      const valorInativo = inativosAltoValor.reduce((sum, c) => sum + (Number(c.valor_estimado) || 0), 0);
      alertasList.push({
        id: 'inativos-alto-valor',
        tipo: 'atencao',
        titulo: `${inativosAltoValor.length} contratos inativos de alto valor`,
        descricao: `Potencial de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorInativo)} em recuperação`,
        valor: valorInativo,
        acao: 'Tentar reativação'
      });
    }
    
    // 7. Pipeline saudável (positivo)
    const contratosNovosRecentes = contratos.filter(c => {
      const createdAt = new Date(c.created_at);
      const dias30 = subDays(hoje, 30);
      return createdAt >= dias30 && c.status_contrato === 'Ativo';
    });
    if (contratosNovosRecentes.length >= 5) {
      alertasList.push({
        id: 'pipeline-saudavel',
        tipo: 'oportunidade',
        titulo: 'Pipeline saudável',
        descricao: `${contratosNovosRecentes.length} novos contratos nos últimos 30 dias`,
        acao: 'Manter momentum'
      });
    }
    
    return alertasList;
  }, [contratosPorStatus, kpis, tipoServicoData, contratos]);

  const handlePeriodoChange = useCallback((periodo: PeriodoRapido) => {
    setPeriodoRapido(periodo);
    if (periodo !== "personalizado") {
      setDataInicio("");
      setDataFim("");
    }
  }, []);

  return {
    // Filters
    periodoRapido,
    setPeriodoRapido: handlePeriodoChange,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    tipoServicoFiltro,
    setTipoServicoFiltro,
    clienteFiltro,
    setClienteFiltro,
    statusFiltro,
    setStatusFiltro,
    faixaValorFiltro,
    setFaixaValorFiltro,
    somenteAtivos,
    setSomenteAtivos,
    metricaTipoServico,
    setMetricaTipoServico,
    filterOptions,
    
    // Loading state
    isLoading,
    
    // Data
    kpis,
    tipoServicoData,
    statusData,
    evolucaoMensal,
    contratosVencer,
    topContratos,
    alertas,
    contratosPorStatus,
    totalContratos: filteredContratos.length
  };
}
