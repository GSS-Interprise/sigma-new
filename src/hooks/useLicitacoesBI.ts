import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, addMonths, differenceInDays, parseISO, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "ano" | "personalizado";

interface Licitacao {
  id: string;
  numero_edital: string;
  objeto: string;
  orgao: string;
  tipo_modalidade: string | null;
  subtipo_modalidade: string | null;
  status: string;
  valor_estimado: number | null;
  created_at: string | null;
  updated_at: string | null;
  data_disputa: string | null;
  data_abertura: string | null;
  municipio_uf: string | null;
  prioridade: string | null;
}

export interface AlertaLicitacao {
  id: string;
  tipo: 'risco' | 'oportunidade' | 'atencao';
  titulo: string;
  descricao: string;
  valor?: number;
  acao?: string;
  licitacoes?: Licitacao[];  // Lista de licitações para drill-down
}

// Status labels mapping
const STATUS_LABELS: Record<string, string> = {
  'captacao_edital': 'Captação',
  'edital_analise': 'Análise',
  'deliberacao': 'Deliberação',
  'esclarecimentos_impugnacao': 'Esclarecimentos',
  'cadastro_proposta': 'Cadastro',
  'aguardando_sessao': 'Aguardando',
  'em_disputa': 'Em Disputa',
  'proposta_final': 'Proposta Final',
  'recurso_contrarrazao': 'Recurso',
  'adjudicacao_homologacao': 'Homologação',
  'arrematados': 'Ganha',
  'descarte_edital': 'Descartada',
  'suspenso_revogado': 'Suspensa/Revogada',
  'nao_ganhamos': 'Perdida',
  'capitacao_de_credenciamento': 'Credenciamento'
};

// Status categories for strategic grouping
const STATUS_CATEGORIES: Record<string, string> = {
  'captacao_edital': 'captacao',
  'edital_analise': 'analise',
  'deliberacao': 'deliberacao',
  'esclarecimentos_impugnacao': 'analise',
  'cadastro_proposta': 'cadastro',
  'aguardando_sessao': 'disputa',
  'em_disputa': 'disputa',
  'proposta_final': 'disputa',
  'recurso_contrarrazao': 'recurso',
  'adjudicacao_homologacao': 'homologacao',
  'arrematados': 'ganha',
  'descarte_edital': 'perdida',
  'suspenso_revogado': 'suspensa',
  'nao_ganhamos': 'perdida',
  'capitacao_de_credenciamento': 'captacao'
};

// Funnel stages order
const FUNNEL_STAGES = [
  { id: 'captacao', label: 'Captação', statuses: ['captacao_edital', 'capitacao_de_credenciamento'] },
  { id: 'cadastro', label: 'Cadastro', statuses: ['edital_analise', 'deliberacao', 'esclarecimentos_impugnacao', 'cadastro_proposta'] },
  { id: 'disputa', label: 'Em Disputa', statuses: ['aguardando_sessao', 'em_disputa', 'proposta_final'] },
  { id: 'deliberacao', label: 'Deliberação', statuses: ['recurso_contrarrazao', 'adjudicacao_homologacao'] },
  { id: 'ganha', label: 'Ganha', statuses: ['arrematados'] },
  { id: 'perdida', label: 'Perdida', statuses: ['descarte_edital', 'nao_ganhamos'] }
];

export function useLicitacoesBI() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("trimestre");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [modalidadeFiltro, setModalidadeFiltro] = useState("all");
  const [faixaValorFiltro, setFaixaValorFiltro] = useState("all");
  const [filtroRapido, setFiltroRapido] = useState<'todas' | 'ativas' | 'disputa' | 'encerradas'>('todas');
  const [metricaModalidade, setMetricaModalidade] = useState<'valor' | 'quantidade'>('quantidade');

  // Calculate date range
  const dateRange = useMemo(() => {
    const hoje = new Date();
    
    switch (periodoRapido) {
      case "mes_atual":
        return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };
      case "mes_anterior":
        const mesAnterior = subMonths(hoje, 1);
        return { inicio: startOfMonth(mesAnterior), fim: endOfMonth(mesAnterior) };
      case "trimestre":
        return { inicio: startOfMonth(subMonths(hoje, 2)), fim: endOfMonth(hoje) };
      case "semestre":
        return { inicio: startOfMonth(subMonths(hoje, 5)), fim: endOfMonth(hoje) };
      case "ano":
        return { inicio: startOfMonth(subMonths(hoje, 11)), fim: endOfMonth(hoje) };
      case "personalizado":
        return {
          inicio: dataInicio ? parseISO(dataInicio) : null,
          fim: dataFim ? parseISO(dataFim) : null
        };
      default:
        return { inicio: null, fim: null };
    }
  }, [periodoRapido, dataInicio, dataFim]);

  // Fetch all licitacoes
  const { data: licitacoes = [], isLoading } = useQuery({
    queryKey: ['licitacoes-bi-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('licitacoes')
        .select('id,status,tipo_modalidade,valor_estimado,data_disputa,created_at,municipio_uf,prioridade')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Licitacao[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Filter options
  const filterOptions = useMemo(() => {
    const modalidades = new Set<string>();
    const statusList = new Set<string>();
    
    licitacoes.forEach(l => {
      const label = [l.tipo_modalidade, l.subtipo_modalidade].filter(Boolean).join(' / ');
      if (label) modalidades.add(label);
      if (l.status) statusList.add(l.status);
    });
    
    return {
      modalidades: Array.from(modalidades).sort(),
      status: Array.from(statusList).sort()
    };
  }, [licitacoes]);

  // Active status (not ended)
  const isActiveStatus = (status: string) => {
    return !['arrematados', 'descarte_edital', 'nao_ganhamos'].includes(status);
  };

  // Filtered licitacoes
  const filteredLicitacoes = useMemo(() => {
    return licitacoes.filter(l => {
      // Date filter
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(l.created_at || '');
        if (createdAt < dateRange.inicio || createdAt > dateRange.fim) return false;
      }

      // Status filter
      if (statusFiltro !== "all" && l.status !== statusFiltro) return false;

      // Modalidade filter
      if (modalidadeFiltro !== "all") {
        const label = [l.tipo_modalidade, l.subtipo_modalidade].filter(Boolean).join(' / ');
        if (label !== modalidadeFiltro) return false;
      }

      // Faixa de valor
      if (faixaValorFiltro !== "all") {
        const valor = Number(l.valor_estimado) || 0;
        switch (faixaValorFiltro) {
          case "ate_50k": if (valor > 50000) return false; break;
          case "50k_200k": if (valor < 50000 || valor > 200000) return false; break;
          case "200k_500k": if (valor < 200000 || valor > 500000) return false; break;
          case "500k_1m": if (valor < 500000 || valor > 1000000) return false; break;
          case "acima_1m": if (valor < 1000000) return false; break;
        }
      }

      // Filtro rápido
      switch (filtroRapido) {
        case 'ativas':
          if (!isActiveStatus(l.status)) return false;
          break;
        case 'disputa':
          if (!['aguardando_sessao', 'em_disputa', 'proposta_final'].includes(l.status)) return false;
          break;
        case 'encerradas':
          if (isActiveStatus(l.status)) return false;
          break;
      }

      return true;
    });
  }, [licitacoes, dateRange, statusFiltro, modalidadeFiltro, faixaValorFiltro, filtroRapido]);

  // Previous period for comparison
  const previousPeriodLicitacoes = useMemo(() => {
    if (!dateRange.inicio || !dateRange.fim) return [];
    
    const periodLength = differenceInDays(dateRange.fim, dateRange.inicio);
    const prevStart = subDays(dateRange.inicio, periodLength + 1);
    const prevEnd = subDays(dateRange.inicio, 1);
    
    return licitacoes.filter(l => {
      const createdAt = new Date(l.created_at || '');
      return createdAt >= prevStart && createdAt <= prevEnd;
    });
  }, [licitacoes, dateRange]);

  // Licitacoes by category
  const licitacoesPorCategoria = useMemo(() => {
    const ativas = filteredLicitacoes.filter(l => isActiveStatus(l.status));
    const encerradas = filteredLicitacoes.filter(l => !isActiveStatus(l.status));
    const ganhas = filteredLicitacoes.filter(l => l.status === 'arrematados');
    const perdidas = filteredLicitacoes.filter(l => ['descarte_edital', 'nao_ganhamos'].includes(l.status));
    const emDisputa = filteredLicitacoes.filter(l => 
      ['aguardando_sessao', 'em_disputa', 'proposta_final'].includes(l.status)
    );
    
    return { ativas, encerradas, ganhas, perdidas, emDisputa };
  }, [filteredLicitacoes]);

  // KPIs
  const kpis = useMemo(() => {
    const { ativas, encerradas, ganhas, perdidas } = licitacoesPorCategoria;
    
    // Taxa de conversão
    const taxaConversao = encerradas.length > 0 
      ? (ganhas.length / encerradas.length) * 100 
      : 0;
    
    // Valor potencial do pipeline (ativas)
    const valorPotencial = ativas.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);
    
    // Valor convertido (ganhas)
    const valorConvertido = ganhas.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);

    // Previous period comparison
    const prevAtivas = previousPeriodLicitacoes.filter(l => isActiveStatus(l.status));
    const prevEncerradas = previousPeriodLicitacoes.filter(l => !isActiveStatus(l.status));
    const prevGanhas = previousPeriodLicitacoes.filter(l => l.status === 'arrematados');
    const prevTaxaConversao = prevEncerradas.length > 0 
      ? (prevGanhas.length / prevEncerradas.length) * 100 
      : 0;
    const prevValorPotencial = prevAtivas.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);

    // Variations
    const variacaoTotal = previousPeriodLicitacoes.length > 0
      ? ((filteredLicitacoes.length - previousPeriodLicitacoes.length) / previousPeriodLicitacoes.length) * 100
      : 0;
    const variacaoConversao = prevTaxaConversao > 0
      ? taxaConversao - prevTaxaConversao
      : 0;
    const variacaoValorPotencial = prevValorPotencial > 0
      ? ((valorPotencial - prevValorPotencial) / prevValorPotencial) * 100
      : 0;
    
    return {
      total: filteredLicitacoes.length,
      ativas: ativas.length,
      encerradas: encerradas.length,
      ganhas: ganhas.length,
      perdidas: perdidas.length,
      taxaConversao,
      valorPotencial,
      valorConvertido,
      variacaoTotal,
      variacaoConversao,
      variacaoValorPotencial
    };
  }, [filteredLicitacoes, licitacoesPorCategoria, previousPeriodLicitacoes]);

  // Status data with strategic colors
  const statusData = useMemo(() => {
    const counts: Record<string, { count: number; valor: number }> = {};
    
    filteredLicitacoes.forEach(l => {
      const status = l.status || 'Não informado';
      if (!counts[status]) counts[status] = { count: 0, valor: 0 };
      counts[status].count += 1;
      counts[status].valor += Number(l.valor_estimado) || 0;
    });
    
    const total = filteredLicitacoes.length;
    
    return Object.entries(counts)
      .map(([status, data]) => ({
        status,
        label: STATUS_LABELS[status] || status,
        count: data.count,
        valor: data.valor,
        percentual: total > 0 ? (data.count / total) * 100 : 0,
        category: STATUS_CATEGORIES[status] || 'outros'
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredLicitacoes]);

  // Modalidade data with comparison
  const modalidadeData = useMemo(() => {
    const current: Record<string, { quantidade: number; valor: number }> = {};
    const previous: Record<string, { quantidade: number; valor: number }> = {};
    
    const getModalidadeLabel = (l: Licitacao) => [l.tipo_modalidade, l.subtipo_modalidade].filter(Boolean).join(' / ') || 'Não informado';
    
    filteredLicitacoes.forEach(l => {
      const modalidade = getModalidadeLabel(l);
      if (!current[modalidade]) current[modalidade] = { quantidade: 0, valor: 0 };
      current[modalidade].quantidade += 1;
      current[modalidade].valor += Number(l.valor_estimado) || 0;
    });

    previousPeriodLicitacoes.forEach(l => {
      const modalidade = getModalidadeLabel(l);
      if (!previous[modalidade]) previous[modalidade] = { quantidade: 0, valor: 0 };
      previous[modalidade].quantidade += 1;
      previous[modalidade].valor += Number(l.valor_estimado) || 0;
    });

    const total = filteredLicitacoes.length;
    const totalValor = filteredLicitacoes.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);

    // Calculate conversion rate per modalidade
    const conversionRates: Record<string, number> = {};
    filterOptions.modalidades.forEach(mod => {
      const modLicitacoes = filteredLicitacoes.filter(l => getModalidadeLabel(l) === mod);
      const modGanhas = modLicitacoes.filter(l => l.status === 'arrematados');
      const modEncerradas = modLicitacoes.filter(l => !isActiveStatus(l.status));
      conversionRates[mod] = modEncerradas.length > 0 ? (modGanhas.length / modEncerradas.length) * 100 : 0;
    });
    
    return Object.entries(current)
      .map(([modalidade, data]) => {
        const prev = previous[modalidade] || { quantidade: 0, valor: 0 };
        return {
          modalidade,
          quantidade: data.quantidade,
          quantidadeAnterior: prev.quantidade,
          valor: data.valor,
          valorAnterior: prev.valor,
          percentualQtd: total > 0 ? (data.quantidade / total) * 100 : 0,
          percentualValor: totalValor > 0 ? (data.valor / totalValor) * 100 : 0,
          taxaConversao: conversionRates[modalidade] || 0,
          variacaoQtd: prev.quantidade > 0 ? ((data.quantidade - prev.quantidade) / prev.quantidade) * 100 : 0,
          variacaoValor: prev.valor > 0 ? ((data.valor - prev.valor) / prev.valor) * 100 : 0
        };
      })
      .sort((a, b) => metricaModalidade === 'valor' ? b.valor - a.valor : b.quantidade - a.quantidade);
  }, [filteredLicitacoes, previousPeriodLicitacoes, filterOptions.modalidades, metricaModalidade]);

  // Monthly evolution with multiple lines
  const evolucaoMensal = useMemo(() => {
    const months: Record<string, { iniciadas: number; encerradas: number; ganhas: number; valor: number; date: Date }> = {};
    
    licitacoes.forEach(l => {
      const date = l.created_at ? new Date(l.created_at) : null;
      if (!date || isNaN(date.getTime())) return;
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { iniciadas: 0, encerradas: 0, ganhas: 0, valor: 0, date };
      }
      
      months[monthKey].iniciadas += 1;
      months[monthKey].valor += Number(l.valor_estimado) || 0;
      
      if (!isActiveStatus(l.status)) {
        months[monthKey].encerradas += 1;
      }
      if (l.status === 'arrematados') {
        months[monthKey].ganhas += 1;
      }
    });
    
    const sorted = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
    
    const data = sorted.map(([key, val]) => {
      const taxaConversao = val.encerradas > 0 ? (val.ganhas / val.encerradas) * 100 : 0;
      
      return {
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        iniciadas: val.iniciadas,
        encerradas: val.encerradas,
        ganhas: val.ganhas,
        valorPotencial: val.valor,
        taxaConversao,
        isProjection: false
      };
    });
    
    // Add projection
    if (data.length >= 3) {
      const recentData = data.slice(-6);
      const n = recentData.length;
      
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      recentData.forEach((d, i) => {
        sumX += i;
        sumY += d.iniciadas;
        sumXY += i * d.iniciadas;
        sumX2 += i * i;
      });
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      for (let i = 1; i <= 2; i++) {
        const projectedDate = addMonths(new Date(), i);
        const projectedValue = Math.max(0, Math.round(intercept + slope * (n + i - 1)));
        
        data.push({
          mes: format(projectedDate, 'MMM/yy', { locale: ptBR }),
          iniciadas: projectedValue,
          encerradas: 0,
          ganhas: 0,
          valorPotencial: 0,
          taxaConversao: 0,
          isProjection: true
        });
      }
    }
    
    return data;
  }, [licitacoes]);

  // Funnel data with conversion rates
  const funilData = useMemo(() => {
    const stages = FUNNEL_STAGES.map(stage => {
      const count = filteredLicitacoes.filter(l => stage.statuses.includes(l.status)).length;
      const valor = filteredLicitacoes
        .filter(l => stage.statuses.includes(l.status))
        .reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);
      
      return {
        id: stage.id,
        etapa: stage.label,
        quantidade: count,
        valor
      };
    });

    // Calculate conversion rates between stages
    const stagesWithConversion = stages.map((stage, index) => {
      let taxaConversao = 100;
      if (index > 0 && stages[0].quantidade > 0) {
        taxaConversao = (stage.quantidade / stages[0].quantidade) * 100;
      }
      
      let taxaEtapaAnterior = 100;
      if (index > 0 && stages[index - 1].quantidade > 0) {
        taxaEtapaAnterior = (stage.quantidade / stages[index - 1].quantidade) * 100;
      }

      return {
        ...stage,
        taxaConversao,
        taxaEtapaAnterior,
        isGargalo: index > 0 && taxaEtapaAnterior < 50
      };
    });

    return stagesWithConversion;
  }, [filteredLicitacoes]);

  // Strategic alerts with drilldown licitações
  const alertas = useMemo((): AlertaLicitacao[] => {
    const alertasList: AlertaLicitacao[] = [];
    const hoje = new Date();

    // 1. Licitações paradas há mais de 15 dias
    const paradasMuitoTempo = filteredLicitacoes.filter(l => {
      if (!isActiveStatus(l.status)) return false;
      const updatedAt = new Date(l.updated_at || l.created_at || '');
      return differenceInDays(hoje, updatedAt) > 15;
    });
    if (paradasMuitoTempo.length > 0) {
      alertasList.push({
        id: 'paradas',
        tipo: 'atencao',
        titulo: `${paradasMuitoTempo.length} licitações paradas há mais de 15 dias`,
        descricao: 'Sem atualização de status recente',
        acao: 'Revisar e atualizar status',
        licitacoes: paradasMuitoTempo
      });
    }

    // 2. Licitações em disputa com alto valor
    const disputaAltoValor = licitacoesPorCategoria.emDisputa.filter(l => 
      (Number(l.valor_estimado) || 0) > 200000
    );
    if (disputaAltoValor.length > 0) {
      const valorTotal = disputaAltoValor.reduce((sum, l) => sum + (Number(l.valor_estimado) || 0), 0);
      alertasList.push({
        id: 'disputa-alto-valor',
        tipo: 'oportunidade',
        titulo: `${disputaAltoValor.length} licitações de alto valor em disputa`,
        descricao: `Valor potencial: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}`,
        valor: valorTotal,
        acao: 'Priorizar acompanhamento',
        licitacoes: disputaAltoValor
      });
    }

    // 3. Modalidades com baixa conversão
    const modalidadeBaixaConversao = modalidadeData.find(m => 
      m.quantidade >= 5 && m.taxaConversao < 15
    );
    if (modalidadeBaixaConversao) {
      // Filtrar licitações dessa modalidade
      const getLabel = (l: Licitacao) => [l.tipo_modalidade, l.subtipo_modalidade].filter(Boolean).join(' / ') || 'Não informado';
      const licitacoesDaModalidade = filteredLicitacoes.filter(l => 
        getLabel(l) === modalidadeBaixaConversao.modalidade
      );
      alertasList.push({
        id: 'baixa-conversao-modalidade',
        tipo: 'risco',
        titulo: `Baixa conversão em ${modalidadeBaixaConversao.modalidade}`,
        descricao: `Taxa de ${modalidadeBaixaConversao.taxaConversao.toFixed(1)}% com ${modalidadeBaixaConversao.quantidade} licitações`,
        acao: 'Analisar causa raiz',
        licitacoes: licitacoesDaModalidade
      });
    }

    // 4. Queda na taxa de conversão
    if (kpis.variacaoConversao < -5) {
      alertasList.push({
        id: 'queda-conversao',
        tipo: 'risco',
        titulo: 'Queda na taxa de conversão',
        descricao: `Redução de ${Math.abs(kpis.variacaoConversao).toFixed(1)} pontos percentuais`,
        acao: 'Investigar gargalos',
        licitacoes: [] // Alerta sem lista específica
      });
    }

    // 5. Aumento de licitações perdidas
    const prevPerdidas = previousPeriodLicitacoes.filter(l => 
      ['descarte_edital', 'nao_ganhamos'].includes(l.status)
    );
    const licitacoesPerdidas = filteredLicitacoes.filter(l => 
      ['descarte_edital', 'nao_ganhamos'].includes(l.status)
    );
    if (kpis.perdidas > prevPerdidas.length && kpis.perdidas >= 3) {
      alertasList.push({
        id: 'aumento-perdidas',
        tipo: 'atencao',
        titulo: 'Aumento de licitações perdidas',
        descricao: `${kpis.perdidas} perdidas no período (anterior: ${prevPerdidas.length})`,
        acao: 'Analisar motivos',
        licitacoes: licitacoesPerdidas
      });
    }

    // 6. Pipeline saudável (positivo)
    if (kpis.taxaConversao > 25 && kpis.ganhas >= 3) {
      const licitacoesGanhas = filteredLicitacoes.filter(l => l.status === 'ganhamos');
      alertasList.push({
        id: 'conversao-alta',
        tipo: 'oportunidade',
        titulo: 'Taxa de conversão acima da média',
        descricao: `${kpis.taxaConversao.toFixed(1)}% de conversão no período`,
        acao: 'Manter estratégia',
        licitacoes: licitacoesGanhas
      });
    }

    // 7. Gargalo identificado no funil
    const gargalo = funilData.find(f => f.isGargalo);
    if (gargalo) {
      // Encontrar licitações na etapa do gargalo
      const stageConfig = FUNNEL_STAGES.find(s => s.label === gargalo.etapa);
      const licitacoesNoGargalo = stageConfig 
        ? filteredLicitacoes.filter(l => stageConfig.statuses.includes(l.status))
        : [];
      alertasList.push({
        id: 'gargalo-funil',
        tipo: 'risco',
        titulo: `Gargalo identificado: ${gargalo.etapa}`,
        descricao: `Apenas ${gargalo.taxaEtapaAnterior.toFixed(0)}% avançam para esta etapa`,
        acao: 'Otimizar processo',
        licitacoes: licitacoesNoGargalo
      });
    }

    return alertasList;
  }, [filteredLicitacoes, licitacoesPorCategoria, modalidadeData, kpis, previousPeriodLicitacoes, funilData]);

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
    statusFiltro,
    setStatusFiltro,
    modalidadeFiltro,
    setModalidadeFiltro,
    faixaValorFiltro,
    setFaixaValorFiltro,
    filtroRapido,
    setFiltroRapido,
    metricaModalidade,
    setMetricaModalidade,
    filterOptions,
    
    // Loading state
    isLoading,
    
    // Data
    kpis,
    statusData,
    modalidadeData,
    evolucaoMensal,
    funilData,
    alertas,
    licitacoesPorCategoria,
    totalLicitacoes: filteredLicitacoes.length,
    STATUS_LABELS
  };
}
