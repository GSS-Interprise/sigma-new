import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, addMonths, differenceInDays, parseISO, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "ano" | "personalizado";

export interface AlertaAges {
  id: string;
  tipo: 'risco' | 'oportunidade' | 'atencao';
  titulo: string;
  descricao: string;
  valor?: number;
  acao?: string;
}

interface Profissional {
  id: string;
  nome: string;
  profissao: string;
  status: string;
  cidade: string | null;
  uf: string | null;
  created_at: string;
  updated_at: string;
}

interface Cliente {
  id: string;
  nome_empresa: string;
  nome_fantasia: string | null;
  status_cliente: string;
  cidade: string | null;
  uf: string | null;
  created_at: string;
}

interface Contrato {
  id: string;
  codigo_interno: number | null;
  profissional_id: string | null;
  ages_cliente_id: string | null;
  cliente_id?: string | null;
  ages_unidade_id: string | null;
  status: string;
  tipo_contrato: string | null;
  carga_horaria_mensal?: number | null;
  valor_mensal: number | null;
  data_inicio: string;
  data_fim: string | null;
  created_at: string;
  updated_at: string;

  profissional?: {
    id: string;
    nome: string;
    profissao: string;
    uf: string | null;
    status: string;
  } | null;
  ages_cliente?: {
    id: string;
    nome_empresa: string;
    uf: string | null;
    status_cliente: string;
  } | null;
}

interface Producao {
  id: string;
  profissional_id: string;
  cliente_id?: string | null;
  ages_cliente_id?: string | null;
  unidade_id: string | null;
  mes_referencia: number;
  ano_referencia: number;
  total_horas: number;
  status_conferencia: string;
  created_at: string;

  profissional?: {
    id: string;
    nome: string;
    profissao: string;
    uf: string | null;
    status: string;
  } | null;
  ages_cliente?: {
    id: string;
    nome_empresa: string;
    uf: string | null;
    status_cliente: string;
  } | null;
}

interface Lead {
  id: string;
  nome: string;
  status: string;
  profissao: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string | null;
  created_at: string;
  updated_at: string;
}

// Status labels
const STATUS_PROFISSIONAL: Record<string, string> = {
  'ativo': 'Ativo',
  'inativo': 'Inativo',
  'afastado': 'Afastado',
  'pendente': 'Pendente'
};

const STATUS_CONTRATO: Record<string, string> = {
  'Ativo': 'Ativo',
  'Inativo': 'Inativo',
  'Encerrado': 'Encerrado',
  'Suspenso': 'Suspenso',
  'Pendente': 'Pendente'
};

const STATUS_LEAD: Record<string, string> = {
  'novo': 'Novo',
  'contato': 'Contato Realizado',
  'proposta': 'Proposta Enviada',
  'negociacao': 'Em Negociação',
  'convertido': 'Convertido',
  'perdido': 'Perdido'
};

// Helper para comparação case-insensitive
const normalizeStatus = (status: string | null | undefined) => (status || '').toLowerCase();

const BASELINE_HORAS_MES = 160;
const RISCO_PESOS = {
  pendencia_validacao: 0.5,
  baixa_execucao: 0.3,
  sem_producao: 0.2,
} as const;

const normalizeTipoContrato = (tipo: string | null | undefined) => {
  const t = (tipo || '').toLowerCase();
  if (!t) return 'outros';
  if (t.includes('licita')) return 'licitacao';
  if (t.includes('dispensa')) return 'dispensa';
  return 'outros';
};

const getProducaoClienteId = (p: Producao) => p.ages_cliente_id ?? p.cliente_id ?? p.ages_cliente?.id ?? null;
const getContratoClienteId = (c: Contrato) => c.ages_cliente_id ?? c.cliente_id ?? c.ages_cliente?.id ?? null;

// Funnel stages for leads
const FUNNEL_STAGES = [
  { id: 'novo', label: 'Lead Captado', statuses: ['novo'] },
  { id: 'contato', label: 'Contato Realizado', statuses: ['contato'] },
  { id: 'proposta', label: 'Proposta Enviada', statuses: ['proposta'] },
  { id: 'negociacao', label: 'Em Negociação', statuses: ['negociacao'] },
  { id: 'convertido', label: 'Convertido', statuses: ['convertido'] },
  { id: 'perdido', label: 'Perdido', statuses: ['perdido'] }
];

export function useAgesBI() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("trimestre");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ufFiltro, setUfFiltro] = useState("__all__");
  const [cidadeFiltro, setCidadeFiltro] = useState("__all__");
  const [statusFiltro, setStatusFiltro] = useState("__all__");
  const [profissaoFiltro, setProfissaoFiltro] = useState("__all__");
  const [clienteFiltro, setClienteFiltro] = useState("__all__");
  const [tipoContratoFiltro, setTipoContratoFiltro] = useState("__all__");
  const [origemLeadFiltro, setOrigemLeadFiltro] = useState("__all__");

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

  // Previous period for comparison
  const previousDateRange = useMemo(() => {
    if (!dateRange.inicio || !dateRange.fim) return { inicio: null, fim: null };
    
    const periodLength = differenceInDays(dateRange.fim, dateRange.inicio);
    return {
      inicio: subDays(dateRange.inicio, periodLength + 1),
      fim: subDays(dateRange.inicio, 1)
    };
  }, [dateRange]);

  // Fetch profissionais
  const { data: profissionais = [], isLoading: loadingProfissionais } = useQuery({
    queryKey: ['ages-bi-profissionais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_profissionais')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Profissional[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch clientes
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['ages-bi-clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_clientes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Cliente[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch contratos
  const { data: contratos = [], isLoading: loadingContratos } = useQuery({
    queryKey: ['ages-bi-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_contratos')
        .select(`
          *,
          profissional:ages_profissionais(id, nome, profissao, uf, status),
          ages_cliente:ages_clientes(id, nome_empresa, uf, status_cliente)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Contrato[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch produção
  const { data: producao = [], isLoading: loadingProducao } = useQuery({
    queryKey: ['ages-bi-producao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_producao')
        .select(`
          *,
          profissional:ages_profissionais(id, nome, profissao, uf, status),
          ages_cliente:ages_clientes(id, nome_empresa, uf, status_cliente)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Producao[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch leads
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['ages-bi-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Lead[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = loadingProfissionais || loadingClientes || loadingContratos || loadingProducao || loadingLeads;

  // Filter options
  const filterOptions = useMemo(() => {
    const ufs = new Set<string>();
    const cidades = new Set<string>();
    const profissoes = new Set<string>();
    const clientesMap = new Map<string, string>();
    const tiposContrato = new Set<string>();
    const origensLead = new Set<string>();

    profissionais.forEach(p => {
      if (p.uf) ufs.add(p.uf);
      if (p.cidade) cidades.add(p.cidade);
      if (p.profissao) profissoes.add(p.profissao);
    });

    clientes.forEach(c => {
      if (c.id && c.nome_empresa) clientesMap.set(c.id, c.nome_empresa);
      if (c.uf) ufs.add(c.uf);
      if (c.cidade) cidades.add(c.cidade);
    });

    contratos.forEach(c => {
      if (c.tipo_contrato) tiposContrato.add(c.tipo_contrato);
    });

    leads.forEach(l => {
      if (l.origem) origensLead.add(l.origem);
      if (l.uf) ufs.add(l.uf);
      if (l.cidade) cidades.add(l.cidade);
      if (l.profissao) profissoes.add(l.profissao);
    });

    return {
      ufs: Array.from(ufs).sort(),
      cidades: Array.from(cidades).sort(),
      profissoes: Array.from(profissoes).sort(),
      clientes: Array.from(clientesMap.entries())
        .map(([id, nome]) => ({ id, nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      tiposContrato: Array.from(tiposContrato).sort(),
      origensLead: Array.from(origensLead).sort()
    };
  }, [profissionais, clientes, contratos, leads]);

  // Filtered data
  const filteredProfissionais = useMemo(() => {
    return profissionais.filter(p => {
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(p.created_at);
        if (createdAt < dateRange.inicio || createdAt > dateRange.fim) return false;
      }
      if (ufFiltro !== "__all__" && p.uf !== ufFiltro) return false;
      if (cidadeFiltro !== "__all__" && p.cidade !== cidadeFiltro) return false;
      if (statusFiltro !== "__all__" && p.status !== statusFiltro) return false;
      if (profissaoFiltro !== "__all__" && p.profissao !== profissaoFiltro) return false;
      return true;
    });
  }, [profissionais, dateRange, ufFiltro, cidadeFiltro, statusFiltro, profissaoFiltro]);

  const filteredContratos = useMemo(() => {
    return contratos.filter(c => {
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(c.created_at);
        if (createdAt < dateRange.inicio || createdAt > dateRange.fim) return false;
      }
      if (statusFiltro !== "__all__" && c.status !== statusFiltro) return false;
      if (tipoContratoFiltro !== "__all__" && c.tipo_contrato !== tipoContratoFiltro) return false;

      if (clienteFiltro !== "__all__") {
        const cid = getContratoClienteId(c);
        if (!cid || cid !== clienteFiltro) return false;
      }

      if (ufFiltro !== "__all__") {
        const uf = c.profissional?.uf ?? c.ages_cliente?.uf ?? null;
        if (uf !== ufFiltro) return false;
      }

      if (profissaoFiltro !== "__all__") {
        const prof = c.profissional?.profissao ?? null;
        if (prof !== profissaoFiltro) return false;
      }

      return true;
    });
  }, [contratos, dateRange, statusFiltro, tipoContratoFiltro, clienteFiltro, ufFiltro, profissaoFiltro]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(l.created_at);
        if (createdAt < dateRange.inicio || createdAt > dateRange.fim) return false;
      }
      if (ufFiltro !== "__all__" && l.uf !== ufFiltro) return false;
      if (cidadeFiltro !== "__all__" && l.cidade !== cidadeFiltro) return false;
      if (profissaoFiltro !== "__all__" && l.profissao !== profissaoFiltro) return false;
      if (origemLeadFiltro !== "__all__" && l.origem !== origemLeadFiltro) return false;
      return true;
    });
  }, [leads, dateRange, ufFiltro, cidadeFiltro, profissaoFiltro, origemLeadFiltro]);

  const filteredProducao = useMemo(() => {
    return producao.filter(p => {
      if (dateRange.inicio && dateRange.fim) {
        const dataRef = new Date(p.ano_referencia, p.mes_referencia - 1, 1);
        if (dataRef < dateRange.inicio || dataRef > dateRange.fim) return false;
      }

      if (clienteFiltro !== "__all__") {
        const cid = getProducaoClienteId(p);
        if (!cid || cid !== clienteFiltro) return false;
      }

      if (ufFiltro !== "__all__") {
        const uf = p.profissional?.uf ?? p.ages_cliente?.uf ?? null;
        if (uf !== ufFiltro) return false;
      }

      if (profissaoFiltro !== "__all__") {
        const prof = p.profissional?.profissao ?? null;
        if (prof !== profissaoFiltro) return false;
      }

      return true;
    });
  }, [producao, dateRange, clienteFiltro, ufFiltro, profissaoFiltro]);

  // Previous period data
  const prevProfissionais = useMemo(() => {
    if (!previousDateRange.inicio || !previousDateRange.fim) return [];
    return profissionais.filter(p => {
      const createdAt = new Date(p.created_at);
      return createdAt >= previousDateRange.inicio! && createdAt <= previousDateRange.fim!;
    });
  }, [profissionais, previousDateRange]);

  const prevContratos = useMemo(() => {
    if (!previousDateRange.inicio || !previousDateRange.fim) return [];
    return contratos.filter(c => {
      const createdAt = new Date(c.created_at);
      return createdAt >= previousDateRange.inicio! && createdAt <= previousDateRange.fim!;
    });
  }, [contratos, previousDateRange]);

  const prevLeads = useMemo(() => {
    if (!previousDateRange.inicio || !previousDateRange.fim) return [];
    return leads.filter(l => {
      const createdAt = new Date(l.created_at);
      return createdAt >= previousDateRange.inicio! && createdAt <= previousDateRange.fim!;
    });
  }, [leads, previousDateRange]);

  // All-time counts (not filtered by period)
  const allTimeCounts = useMemo(() => {
    const profAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo').length;
    const clientesAtivos = clientes.filter(c => normalizeStatus(c.status_cliente) === 'ativo').length;
    const contratosAtivos = contratos.filter(c => normalizeStatus(c.status) === 'ativo').length;
    
    const hoje = new Date();
    const contratosVencer30 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff >= 0 && diff <= 30;
    }).length;
    const contratosVencer60 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff > 30 && diff <= 60;
    }).length;
    const contratosVencer90 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff > 60 && diff <= 90;
    }).length;

    return {
      profAtivos,
      clientesAtivos,
      contratosAtivos,
      contratosVencer30,
      contratosVencer60,
      contratosVencer90
    };
  }, [profissionais, clientes, contratos]);

  // KPIs Visão Geral
  const kpisVisaoGeral = useMemo(() => {
    const profAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo').length;
    const novosProfissionais = filteredProfissionais.length;
    const clientesAtivos = clientes.filter(c => normalizeStatus(c.status_cliente) === 'ativo').length;
    const contratosAtivos = contratos.filter(c => normalizeStatus(c.status) === 'ativo').length;
    
    const hoje = new Date();
    const contratosVencer30 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff >= 0 && diff <= 30;
    }).length;

    const producaoQtd = filteredProducao.length;
    const producaoHoras = filteredProducao.reduce((sum, p) => sum + p.total_horas, 0);

    const leadsNoPeriodo = filteredLeads.length;
    const leadsConvertidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'convertido').length;
    const leadsPerdidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'perdido').length;
    const taxaConversao = leadsNoPeriodo > 0 ? (leadsConvertidos / leadsNoPeriodo) * 100 : 0;

    const valorMensalTotal = contratos
      .filter(c => normalizeStatus(c.status) === 'ativo')
      .reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
    const ticketMedio = contratosAtivos > 0 ? valorMensalTotal / contratosAtivos : 0;

    // Variations
    const varNovosProfissionais = prevProfissionais.length > 0
      ? ((novosProfissionais - prevProfissionais.length) / prevProfissionais.length) * 100
      : 0;
    const varLeads = prevLeads.length > 0
      ? ((leadsNoPeriodo - prevLeads.length) / prevLeads.length) * 100
      : 0;

    return {
      profAtivos,
      novosProfissionais,
      varNovosProfissionais,
      clientesAtivos,
      contratosAtivos,
      contratosVencer30,
      producaoQtd,
      producaoHoras,
      leadsNoPeriodo,
      varLeads,
      taxaConversao,
      ticketMedio,
      leadsConvertidos,
      leadsPerdidos
    };
  }, [profissionais, clientes, contratos, filteredProfissionais, filteredProducao, filteredLeads, prevProfissionais, prevLeads]);

  // KPIs Profissionais
  const kpisProfissionais = useMemo(() => {
    const total = profissionais.length;
    const ativos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo').length;
    const inativos = profissionais.filter(p => normalizeStatus(p.status) === 'inativo').length;
    const novosNoPeriodo = filteredProfissionais.length;
    
    const profissionaisComContrato = new Set(
      contratos.filter(c => normalizeStatus(c.status) === 'ativo' && c.profissional_id).map(c => c.profissional_id)
    ).size;
    const percComContrato = ativos > 0 ? (profissionaisComContrato / ativos) * 100 : 0;

    const profissionaisComProducao = new Set(filteredProducao.map(p => p.profissional_id)).size;
    const percComProducao = ativos > 0 ? (profissionaisComProducao / ativos) * 100 : 0;

    return {
      total,
      ativos,
      inativos,
      novosNoPeriodo,
      percComContrato,
      percComProducao
    };
  }, [profissionais, contratos, filteredProfissionais, filteredProducao]);

  // KPIs Contratos
  const kpisContratos = useMemo(() => {
    const ativos = contratos.filter(c => normalizeStatus(c.status) === 'ativo').length;
    const novosNoPeriodo = filteredContratos.length;
    const encerrados = contratos.filter(c => normalizeStatus(c.status) === 'encerrado').length;
    
    const hoje = new Date();
    const aVencer30 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff >= 0 && diff <= 30;
    }).length;
    const aVencer60 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff > 30 && diff <= 60;
    }).length;
    const aVencer90 = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff > 60 && diff <= 90;
    }).length;

    const vencidos = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      return fim < hoje;
    }).length;

    const valorTotal = contratos
      .filter(c => normalizeStatus(c.status) === 'ativo')
      .reduce((sum, c) => sum + (c.valor_mensal || 0), 0);

    return {
      ativos,
      novosNoPeriodo,
      encerrados,
      aVencer30,
      aVencer60,
      aVencer90,
      vencidos,
      valorTotal
    };
  }, [contratos, filteredContratos]);

  // KPIs Produção
  const kpisProducao = useMemo(() => {
    const totalHoras = filteredProducao.reduce((sum, p) => sum + p.total_horas, 0);
    const totalRegistros = filteredProducao.length;
    
    const profissionaisUnicos = new Set(filteredProducao.map(p => p.profissional_id)).size;
    const clientesUnicos = new Set(filteredProducao.map(p => p.cliente_id)).size;
    
    const mediaPorProfissional = profissionaisUnicos > 0 ? totalHoras / profissionaisUnicos : 0;
    const mediaPorCliente = clientesUnicos > 0 ? totalHoras / clientesUnicos : 0;

    // Crescimento vs período anterior
    const prevProducaoHoras = producao.filter(p => {
      if (!previousDateRange.inicio || !previousDateRange.fim) return false;
      const dataRef = new Date(p.ano_referencia, p.mes_referencia - 1, 1);
      return dataRef >= previousDateRange.inicio && dataRef <= previousDateRange.fim;
    }).reduce((sum, p) => sum + p.total_horas, 0);
    
    const crescimento = prevProducaoHoras > 0
      ? ((totalHoras - prevProducaoHoras) / prevProducaoHoras) * 100
      : 0;

    return {
      totalHoras,
      totalRegistros,
      profissionaisUnicos,
      clientesUnicos,
      mediaPorProfissional,
      mediaPorCliente,
      crescimento
    };
  }, [filteredProducao, producao, previousDateRange]);

  // KPIs Leads
  const kpisLeads = useMemo(() => {
    const total = filteredLeads.length;
    const convertidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'convertido').length;
    const perdidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'perdido').length;
    const taxaConversao = total > 0 ? (convertidos / total) * 100 : 0;
    const taxaPerda = total > 0 ? (perdidos / total) * 100 : 0;

    // Tempo médio até fechamento (simplificado)
    const leadsConvertidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'convertido');
    let tempoMedio = 0;
    if (leadsConvertidos.length > 0) {
      const totalDias = leadsConvertidos.reduce((sum, l) => {
        const created = new Date(l.created_at);
        const updated = new Date(l.updated_at);
        return sum + differenceInDays(updated, created);
      }, 0);
      tempoMedio = totalDias / leadsConvertidos.length;
    }

    return {
      total,
      convertidos,
      perdidos,
      taxaConversao,
      taxaPerda,
      tempoMedio
    };
  }, [filteredLeads]);

  // =====================
  // KPIs oficiais (AGES) — orientam o BI em camadas
  // =====================
  const kpisOficiais = useMemo(() => {
    const profissionaisAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo');
    const profAtivosCount = profissionaisAtivos.length;

    const producaoTotalHoras = filteredProducao.reduce((sum, p) => sum + (p.total_horas || 0), 0);
    const capacidadeHoras = profAtivosCount * BASELINE_HORAS_MES;
    const capacidadeUtilizadaPerc = capacidadeHoras > 0 ? (producaoTotalHoras / capacidadeHoras) * 100 : 0;

    const profissionaisComProducao = new Set(filteredProducao.map(p => p.profissional_id));
    const profissionaisSemProducaoPeriodo = profissionaisAtivos.filter(p => !profissionaisComProducao.has(p.id)).length;

    const contratosAtivos = contratos.filter(c => normalizeStatus(c.status) === 'ativo');
    const contratosAtivosLicitacao = contratosAtivos.filter(c => normalizeTipoContrato(c.tipo_contrato) === 'licitacao').length;
    const contratosAtivosDispensa = contratosAtivos.filter(c => normalizeTipoContrato(c.tipo_contrato) === 'dispensa').length;

    const producaoPendenteValidacaoHoras = filteredProducao
      .filter(p => {
        const s = normalizeStatus(p.status_conferencia);
        return s !== 'conferido' && s !== 'aprovado';
      })
      .reduce((sum, p) => sum + (p.total_horas || 0), 0);

    // Execução por contrato (match aproximado: profissional + cliente)
    const producaoByProfCliente = new Map<string, number>();
    for (const p of filteredProducao) {
      const cid = getProducaoClienteId(p);
      const key = `${p.profissional_id}::${cid || 'null'}`;
      producaoByProfCliente.set(key, (producaoByProfCliente.get(key) || 0) + (p.total_horas || 0));
    }

    const contratosExecucao = contratosAtivos.map(c => {
      const cid = getContratoClienteId(c);
      const key = `${c.profissional_id || 'null'}::${cid || 'null'}`;
      const horas = producaoByProfCliente.get(key) || 0;
      const capacidade = (c.carga_horaria_mensal ?? BASELINE_HORAS_MES) || BASELINE_HORAS_MES;
      const execucaoPerc = capacidade > 0 ? (horas / capacidade) * 100 : 0;
      return {
        contrato: c,
        horas,
        capacidade,
        execucaoPerc,
      };
    });

    const contratosBaixaExecucao = contratosExecucao.filter(x => x.execucaoPerc > 0 && x.execucaoPerc < 50).length;

    // Top clientes por produção (no período/recorte atual)
    const clienteHoras = new Map<string, { id: string; nome: string; horas: number }>();
    for (const p of filteredProducao) {
      const cid = getProducaoClienteId(p);
      if (!cid) continue;
      const cur = clienteHoras.get(cid) || {
        id: cid,
        nome: p.ages_cliente?.nome_empresa || '—',
        horas: 0,
      };
      cur.horas += (p.total_horas || 0);
      clienteHoras.set(cid, cur);
    }
    const clientesMaiorVolumeProducao = Array.from(clienteHoras.values())
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);

    // Pipeline + tempo médio conversão (usando ages_leads)
    const leadsConvertidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'convertido');
    const temposDias = leadsConvertidos
      .map(l => {
        const ini = new Date(l.created_at);
        const fim = new Date(l.updated_at || l.created_at);
        const dias = differenceInDays(fim, ini);
        return Number.isFinite(dias) ? dias : 0;
      })
      .filter(d => d >= 0);
    const tempoMedioConversaoDias = temposDias.length
      ? temposDias.reduce((a, b) => a + b, 0) / temposDias.length
      : 0;

    // Risco operacional (0-100)
    const pctPendenteValidacao = producaoTotalHoras > 0 ? (producaoPendenteValidacaoHoras / producaoTotalHoras) * 100 : 0;
    const pctBaixaExecucao = contratosAtivos.length > 0 ? (contratosBaixaExecucao / contratosAtivos.length) * 100 : 0;
    const pctSemProducao = profAtivosCount > 0 ? (profissionaisSemProducaoPeriodo / profAtivosCount) * 100 : 0;
    const riscoOperacionalScore =
      pctPendenteValidacao * RISCO_PESOS.pendencia_validacao +
      pctBaixaExecucao * RISCO_PESOS.baixa_execucao +
      pctSemProducao * RISCO_PESOS.sem_producao;

    return {
      profissionaisAtivos: profAtivosCount,
      capacidadeUtilizadaPerc,
      profissionaisSemProducaoPeriodo,
      contratosAtivos: {
        licitacao: contratosAtivosLicitacao,
        dispensa: contratosAtivosDispensa,
        total: contratosAtivos.length,
      },
      contratosBaixaExecucao,
      clientesMaiorVolumeProducao,
      producaoTotalHoras,
      producaoPendenteValidacaoHoras,
      tempoMedioConversaoDias,
      riscoOperacionalScore,
      _contratosExecucao: contratosExecucao,
      _pipeline: FUNNEL_STAGES.map(s => ({
        id: s.id,
        label: s.label,
        quantidade: filteredLeads.filter(l => s.statuses.includes(normalizeStatus(l.status))).length,
      })),
    };
  }, [profissionais, contratos, filteredProducao, filteredLeads]);

  const chartsOficiais = useMemo(() => {
    // Produção x Profissional
    const prodPorProf = new Map<string, { id: string; nome: string; profissao: string | null; horas: number }>();
    for (const p of filteredProducao) {
      const cur = prodPorProf.get(p.profissional_id) || {
        id: p.profissional_id,
        nome: p.profissional?.nome || '—',
        profissao: p.profissional?.profissao || null,
        horas: 0,
      };
      cur.horas += (p.total_horas || 0);
      prodPorProf.set(p.profissional_id, cur);
    }

    // Produção x Cliente
    const prodPorCliente = new Map<string, { id: string; nome: string; horas: number }>();
    for (const p of filteredProducao) {
      const cid = getProducaoClienteId(p);
      if (!cid) continue;
      const cur = prodPorCliente.get(cid) || {
        id: cid,
        nome: p.ages_cliente?.nome_empresa || '—',
        horas: 0,
      };
      cur.horas += (p.total_horas || 0);
      prodPorCliente.set(cid, cur);
    }

    // Status da produção
    const statusCount = new Map<string, number>();
    for (const p of filteredProducao) {
      const s = normalizeStatus(p.status_conferencia) || 'desconhecido';
      statusCount.set(s, (statusCount.get(s) || 0) + 1);
    }

    return {
      producaoPorProfissional: Array.from(prodPorProf.values())
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 12),
      producaoPorCliente: Array.from(prodPorCliente.values())
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 12),
      producaoVsContrato: (kpisOficiais._contratosExecucao || [])
        .map(x => ({
          id: x.contrato.id,
          codigo: x.contrato.codigo_interno ? `#${x.contrato.codigo_interno}` : (x.contrato.id.slice(0, 6) + '…'),
          cliente: x.contrato.ages_cliente?.nome_empresa || '—',
          horas: x.horas,
          capacidade: x.capacidade,
          execucaoPerc: x.execucaoPerc,
          tipo: normalizeTipoContrato(x.contrato.tipo_contrato),
        }))
        .sort((a, b) => a.execucaoPerc - b.execucaoPerc)
        .slice(0, 12),
      statusProducao: Array.from(statusCount.entries()).map(([status, quantidade]) => ({ status, quantidade })),
      pipeline: kpisOficiais._pipeline,
    };
  }, [filteredProducao, kpisOficiais]);

  // Profissionais por profissão
  const profissionaisPorProfissao = useMemo(() => {
    const counts: Record<string, number> = {};
    profissionais.filter(p => normalizeStatus(p.status) === 'ativo').forEach(p => {
      const prof = p.profissao || 'Não informado';
      counts[prof] = (counts[prof] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([profissao, quantidade]) => ({ profissao, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [profissionais]);

  // Profissionais por UF
  const profissionaisPorUF = useMemo(() => {
    const counts: Record<string, number> = {};
    profissionais.filter(p => normalizeStatus(p.status) === 'ativo').forEach(p => {
      const uf = p.uf || 'Não informado';
      counts[uf] = (counts[uf] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([uf, quantidade]) => ({ uf, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [profissionais]);

  // Contratos por tipo
  const contratosPorTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    contratos.filter(c => normalizeStatus(c.status) === 'ativo').forEach(c => {
      const tipo = c.tipo_contrato || 'Não informado';
      counts[tipo] = (counts[tipo] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([tipo, quantidade]) => ({ tipo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [contratos]);

  // Contratos por status
  const contratosPorStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    contratos.forEach(c => {
      const status = c.status || 'Não informado';
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, quantidade]) => ({ status, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [contratos]);

  // Evolução mensal - Profissionais
  const evolucaoProfissionais = useMemo(() => {
    const months: Record<string, { novos: number; ativos: number; date: Date }> = {};
    
    profissionais.forEach(p => {
      const date = new Date(p.created_at);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { novos: 0, ativos: 0, date };
      }
      months[monthKey].novos += 1;
      if (normalizeStatus(p.status) === 'ativo') months[monthKey].ativos += 1;
    });
    
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([_, val]) => ({
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        novos: val.novos,
        ativos: val.ativos
      }));
  }, [profissionais]);

  // Evolução mensal - Contratos
  const evolucaoContratos = useMemo(() => {
    const months: Record<string, { novos: number; ativos: number; encerrados: number; valor: number; date: Date }> = {};
    
    contratos.forEach(c => {
      const date = new Date(c.created_at);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { novos: 0, ativos: 0, encerrados: 0, valor: 0, date };
      }
      months[monthKey].novos += 1;
      if (normalizeStatus(c.status) === 'ativo') {
        months[monthKey].ativos += 1;
        months[monthKey].valor += c.valor_mensal || 0;
      }
      if (normalizeStatus(c.status) === 'encerrado') months[monthKey].encerrados += 1;
    });
    
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([_, val]) => ({
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        novos: val.novos,
        ativos: val.ativos,
        encerrados: val.encerrados,
        valor: val.valor
      }));
  }, [contratos]);

  // Evolução mensal - Produção
  const evolucaoProducao = useMemo(() => {
    const months: Record<string, { horas: number; registros: number }> = {};
    
    producao.forEach(p => {
      const monthKey = `${p.ano_referencia}-${String(p.mes_referencia).padStart(2, '0')}`;
      if (!months[monthKey]) {
        months[monthKey] = { horas: 0, registros: 0 };
      }
      months[monthKey].horas += p.total_horas;
      months[monthKey].registros += 1;
    });
    
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, val]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return {
          mes: format(date, 'MMM/yy', { locale: ptBR }),
          horas: val.horas,
          registros: val.registros
        };
      });
  }, [producao]);

  // Evolução mensal - Leads
  const evolucaoLeads = useMemo(() => {
    const months: Record<string, { captados: number; convertidos: number; perdidos: number; date: Date }> = {};
    
    leads.forEach(l => {
      const date = new Date(l.created_at);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { captados: 0, convertidos: 0, perdidos: 0, date };
      }
      months[monthKey].captados += 1;
      if (normalizeStatus(l.status) === 'convertido') months[monthKey].convertidos += 1;
      if (normalizeStatus(l.status) === 'perdido') months[monthKey].perdidos += 1;
    });
    
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([_, val]) => ({
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        captados: val.captados,
        convertidos: val.convertidos,
        perdidos: val.perdidos,
        taxaConversao: val.captados > 0 ? (val.convertidos / val.captados) * 100 : 0
      }));
  }, [leads]);

  // Funil de leads
  const funilLeads = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const status = normalizeStatus(l.status) || 'novo';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const stages = FUNNEL_STAGES.map(stage => {
      const count = stage.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
      return {
        id: stage.id,
        etapa: stage.label,
        quantidade: count
      };
    });

    const total = stages[0]?.quantidade || 1;
    return stages.map((stage, index) => ({
      ...stage,
      taxaConversao: (stage.quantidade / total) * 100,
      taxaEtapaAnterior: index > 0 && stages[index - 1].quantidade > 0
        ? (stage.quantidade / stages[index - 1].quantidade) * 100
        : 100
    }));
  }, [filteredLeads]);

  // Top profissionais por produção
  const topProfissionaisPorProducao = useMemo(() => {
    const horasPorProf: Record<string, number> = {};
    filteredProducao.forEach(p => {
      horasPorProf[p.profissional_id] = (horasPorProf[p.profissional_id] || 0) + p.total_horas;
    });

    return Object.entries(horasPorProf)
      .map(([profId, horas]) => {
        const prof = profissionais.find(p => p.id === profId);
        return {
          id: profId,
          nome: prof?.nome || 'Desconhecido',
          profissao: prof?.profissao || 'N/A',
          horas
        };
      })
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);
  }, [filteredProducao, profissionais]);

  // Top clientes por produção
  const topClientesPorProducao = useMemo(() => {
    const horasPorCliente: Record<string, number> = {};
    filteredProducao.forEach(p => {
      horasPorCliente[p.cliente_id] = (horasPorCliente[p.cliente_id] || 0) + p.total_horas;
    });

    return Object.entries(horasPorCliente)
      .map(([clienteId, horas]) => {
        const cliente = clientes.find(c => c.id === clienteId);
        return {
          id: clienteId,
          nome: cliente?.nome_fantasia || cliente?.nome_empresa || 'Desconhecido',
          horas
        };
      })
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);
  }, [filteredProducao, clientes]);

  // Alertas estratégicos
  const alertas = useMemo((): AlertaAges[] => {
    const alertasList: AlertaAges[] = [];
    const hoje = new Date();

    // 1. Contratos vencendo nos próximos 30 dias sem renovação
    const contratosVencendo = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff >= 0 && diff <= 30;
    });
    if (contratosVencendo.length > 0) {
      alertasList.push({
        id: 'contratos_vencendo',
        tipo: 'risco',
        titulo: `${contratosVencendo.length} contratos vencendo em 30 dias`,
        descricao: 'Contratos ativos próximos do vencimento sem renovação iniciada.',
        acao: 'Verificar contratos urgentes'
      });
    }

    // 2. Profissionais ativos sem produção no período
    const profissionaisAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo');
    const profComProducao = new Set(filteredProducao.map(p => p.profissional_id));
    const profSemProducao = profissionaisAtivos.filter(p => !profComProducao.has(p.id));
    if (profSemProducao.length > 0 && filteredProducao.length > 0) {
      alertasList.push({
        id: 'sem_producao',
        tipo: 'atencao',
        titulo: `${profSemProducao.length} profissionais sem produção`,
        descricao: 'Profissionais ativos que não registraram produção no período selecionado.',
        acao: 'Verificar alocação'
      });
    }

    // 3. Leads sem atualização há mais de 15 dias
    const leadsParados = leads.filter(l => {
      if (['convertido', 'perdido'].includes(normalizeStatus(l.status))) return false;
      const updatedAt = new Date(l.updated_at);
      return differenceInDays(hoje, updatedAt) > 15;
    });
    if (leadsParados.length > 0) {
      alertasList.push({
        id: 'leads_parados',
        tipo: 'atencao',
        titulo: `${leadsParados.length} leads sem atualização`,
        descricao: 'Leads ativos sem movimentação há mais de 15 dias.',
        acao: 'Retomar contato'
      });
    }

    // 4. Concentração de produção em poucos profissionais
    const totalHoras = filteredProducao.reduce((sum, p) => sum + p.total_horas, 0);
    if (topProfissionaisPorProducao.length >= 3 && totalHoras > 0) {
      const top3Horas = topProfissionaisPorProducao.slice(0, 3).reduce((sum, p) => sum + p.horas, 0);
      const concentracao = (top3Horas / totalHoras) * 100;
      if (concentracao > 60) {
        alertasList.push({
          id: 'concentracao_producao',
          tipo: 'atencao',
          titulo: 'Alta concentração de produção',
          descricao: `Top 3 profissionais concentram ${concentracao.toFixed(0)}% da produção total.`,
          acao: 'Diversificar alocação'
        });
      }
    }

    // 5. Clientes com contratos próximos do fim
    const clientesEmRisco = new Set(
      contratosVencendo.filter(c => c.ages_cliente_id).map(c => c.ages_cliente_id)
    ).size;
    if (clientesEmRisco > 0) {
      alertasList.push({
        id: 'clientes_risco',
        tipo: 'oportunidade',
        titulo: `${clientesEmRisco} clientes para renovação`,
        descricao: 'Clientes com contratos próximos do vencimento - oportunidade de renovação.',
        acao: 'Iniciar negociação'
      });
    }

    // 6. Queda de produção vs período anterior
    const prevProducaoHoras = producao.filter(p => {
      if (!previousDateRange.inicio || !previousDateRange.fim) return false;
      const dataRef = new Date(p.ano_referencia, p.mes_referencia - 1, 1);
      return dataRef >= previousDateRange.inicio && dataRef <= previousDateRange.fim;
    }).reduce((sum, p) => sum + p.total_horas, 0);
    
    if (prevProducaoHoras > 0) {
      const currentHoras = filteredProducao.reduce((sum, p) => sum + p.total_horas, 0);
      const variacao = ((currentHoras - prevProducaoHoras) / prevProducaoHoras) * 100;
      if (variacao < -20) {
        alertasList.push({
          id: 'queda_producao',
          tipo: 'risco',
          titulo: 'Queda significativa na produção',
          descricao: `Produção caiu ${Math.abs(variacao).toFixed(0)}% em relação ao período anterior.`,
          acao: 'Investigar causas'
        });
      }
    }

    return alertasList;
  }, [contratos, profissionais, leads, filteredProducao, producao, topProfissionaisPorProducao, previousDateRange]);

  return {
    // Filters
    periodoRapido,
    setPeriodoRapido,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    ufFiltro,
    setUfFiltro,
    cidadeFiltro,
    setCidadeFiltro,
    statusFiltro,
    setStatusFiltro,
    profissaoFiltro,
    setProfissaoFiltro,
    clienteFiltro,
    setClienteFiltro,
    tipoContratoFiltro,
    setTipoContratoFiltro,
    origemLeadFiltro,
    setOrigemLeadFiltro,
    filterOptions,
    
    // Loading
    isLoading,
    
    // KPIs
    kpisVisaoGeral,
    kpisProfissionais,
    kpisContratos,
    kpisProducao,
    kpisLeads,
    kpisOficiais,
    allTimeCounts,

    // Datasets oficiais (cruzamentos)
    chartsOficiais,
    
    // Charts data
    profissionaisPorProfissao,
    profissionaisPorUF,
    contratosPorTipo,
    contratosPorStatus,
    evolucaoProfissionais,
    evolucaoContratos,
    evolucaoProducao,
    evolucaoLeads,
    funilLeads,
    topProfissionaisPorProducao,
    topClientesPorProducao,
    
    // Alerts
    alertas,
    
    // Raw data for tables
    profissionais: filteredProfissionais,
    contratos: filteredContratos,
    leads: filteredLeads,
    producao: filteredProducao,
    
    // Labels
    STATUS_PROFISSIONAL,
    STATUS_CONTRATO,
    STATUS_LEAD
  };
}
