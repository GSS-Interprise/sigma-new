import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, differenceInDays, parseISO, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "ano" | "personalizado";

export interface AlertaAges360 {
  id: string;
  tipo: 'risco' | 'oportunidade' | 'atencao';
  titulo: string;
  descricao: string;
  valor?: number;
  acao?: string;
  link?: string;
}

interface Profissional {
  id: string;
  nome: string;
  profissao: string;
  status: string;
  cidade: string | null;
  uf: string | null;
  created_at: string;
}

interface Cliente {
  id: string;
  nome_empresa: string;
  nome_fantasia: string | null;
  status_cliente: string;
  uf: string | null;
}

interface Contrato {
  id: string;
  codigo_interno: number | null;
  profissional_id: string | null;
  ages_cliente_id: string | null;
  status: string;
  tipo_contrato: string | null;
  carga_horaria_mensal?: number | null;
  valor_mensal: number | null;
  data_inicio: string;
  data_fim: string | null;
  created_at: string;
  profissional?: { id: string; nome: string; profissao: string; uf: string | null; status: string; } | null;
  ages_cliente?: { id: string; nome_empresa: string; uf: string | null; status_cliente: string; } | null;
}

interface Producao {
  id: string;
  profissional_id: string;
  ages_cliente_id?: string | null;
  mes_referencia: number;
  ano_referencia: number;
  total_horas: number;
  status_conferencia: string;
  profissional?: { id: string; nome: string; profissao: string; uf: string | null; } | null;
  ages_cliente?: { id: string; nome_empresa: string; uf: string | null; } | null;
}

interface Lead {
  id: string;
  nome: string;
  status: string;
  profissao: string | null;
  uf: string | null;
  created_at: string;
  updated_at: string;
}

interface AgesLicitacao {
  id: string;
  licitacao_id: string | null;
  status: string;
  licitacao?: {
    id: string;
    titulo: string | null;
    valor_estimado: string | null;
    status: string | null;
    resultado: string | null;
    data_limite: string | null;
    data_disputa: string | null;
  } | null;
}

interface LicitacaoItem {
  id: string;
  licitacao_id: string;
  nome: string;
  tipo: string;
  licitacao_item_concorrentes: {
    is_gss: boolean;
    is_vencedor: boolean;
    posicao: number;
    valor_ofertado: number;
    empresa_nome: string;
  }[];
}

// Helpers
const normalizeStatus = (status: string | null | undefined) => (status || '').toLowerCase();

const BASELINE_HORAS_MES = 160;

const normalizeTipoContrato = (tipo: string | null | undefined) => {
  const t = (tipo || '').toLowerCase();
  if (!t) return 'outros';
  if (t.includes('licita')) return 'licitacao';
  if (t.includes('dispensa')) return 'dispensa';
  return 'outros';
};

const getContratoClienteId = (c: Contrato) => c.ages_cliente_id ?? c.ages_cliente?.id ?? null;

const FUNNEL_STAGES = [
  { id: 'novo', label: 'Lead Captado', statuses: ['novo'] },
  { id: 'contato', label: 'Contato Realizado', statuses: ['contato'] },
  { id: 'proposta', label: 'Proposta Enviada', statuses: ['proposta'] },
  { id: 'negociacao', label: 'Em Negociação', statuses: ['negociacao'] },
  { id: 'convertido', label: 'Convertido', statuses: ['convertido'] },
];

export function useAgesBI360() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("trimestre");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ufFiltro, setUfFiltro] = useState("__all__");
  const [clienteFiltro, setClienteFiltro] = useState("__all__");
  const [tipoContratoFiltro, setTipoContratoFiltro] = useState("__all__");
  const [profissaoFiltro, setProfissaoFiltro] = useState("__all__");

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
    queryKey: ['ages-bi360-profissionais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_profissionais')
        .select('id, nome, profissao, status, cidade, uf, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Profissional[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch clientes
  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['ages-bi360-clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_clientes')
        .select('id, nome_empresa, nome_fantasia, status_cliente, uf')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Cliente[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch contratos com joins
  const { data: contratos = [], isLoading: loadingContratos } = useQuery({
    queryKey: ['ages-bi360-contratos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_contratos')
        .select(`
          id, codigo_interno, profissional_id, ages_cliente_id, status, tipo_contrato, 
          carga_horaria_mensal, valor_mensal, data_inicio, data_fim, created_at,
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
    queryKey: ['ages-bi360-producao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_producao')
        .select(`
          id, profissional_id, ages_cliente_id, mes_referencia, ano_referencia, total_horas, status_conferencia,
          profissional:ages_profissionais(id, nome, profissao, uf),
          ages_cliente:ages_clientes(id, nome_empresa, uf)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Producao[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch leads
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['ages-bi360-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_leads')
        .select('id, nome, status, profissao, uf, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Lead[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch licitações AGES
  const { data: agesLicitacoes = [], isLoading: loadingAgesLicitacoes } = useQuery({
    queryKey: ['ages-bi360-licitacoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_licitacoes')
        .select(`
          id, licitacao_id, status,
          licitacao:licitacoes(id, titulo, valor_estimado, status, resultado, data_limite, data_disputa)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AgesLicitacao[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch itens de licitação para competitividade (apenas licitações AGES)
  const agesLicitacaoIds = useMemo(() => 
    agesLicitacoes.map(al => al.licitacao_id).filter(Boolean) as string[],
  [agesLicitacoes]);

  const { data: licitacaoItens = [], isLoading: loadingItens } = useQuery({
    queryKey: ['ages-bi360-licitacao-itens', agesLicitacaoIds],
    enabled: agesLicitacaoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('licitacao_itens')
        .select(`*, licitacao_item_concorrentes(*)`)
        .in('licitacao_id', agesLicitacaoIds);
      if (error) throw error;
      return (data || []) as LicitacaoItem[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = loadingProfissionais || loadingClientes || loadingContratos || loadingProducao || loadingLeads || loadingAgesLicitacoes || loadingItens;

  // Filter options
  const filterOptions = useMemo(() => {
    const ufs = new Set<string>();
    const profissoes = new Set<string>();
    const clientesMap = new Map<string, string>();
    const tiposContrato = new Set<string>();

    profissionais.forEach(p => {
      if (p.uf) ufs.add(p.uf);
      if (p.profissao) profissoes.add(p.profissao);
    });
    clientes.forEach(c => {
      if (c.id && c.nome_empresa) clientesMap.set(c.id, c.nome_empresa);
      if (c.uf) ufs.add(c.uf);
    });
    contratos.forEach(c => {
      if (c.tipo_contrato) tiposContrato.add(c.tipo_contrato);
    });
    leads.forEach(l => {
      if (l.uf) ufs.add(l.uf);
      if (l.profissao) profissoes.add(l.profissao);
    });

    return {
      ufs: Array.from(ufs).sort(),
      profissoes: Array.from(profissoes).sort(),
      clientes: Array.from(clientesMap.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      tiposContrato: Array.from(tiposContrato).sort()
    };
  }, [profissionais, clientes, contratos, leads]);

  // Filtered data
  const filteredProducao = useMemo(() => {
    return producao.filter(p => {
      if (dateRange.inicio && dateRange.fim) {
        const dataRef = new Date(p.ano_referencia, p.mes_referencia - 1, 1);
        if (dataRef < dateRange.inicio || dataRef > dateRange.fim) return false;
      }
      if (clienteFiltro !== "__all__" && p.ages_cliente_id !== clienteFiltro) return false;
      if (ufFiltro !== "__all__" && p.profissional?.uf !== ufFiltro && p.ages_cliente?.uf !== ufFiltro) return false;
      if (profissaoFiltro !== "__all__" && p.profissional?.profissao !== profissaoFiltro) return false;
      return true;
    });
  }, [producao, dateRange, clienteFiltro, ufFiltro, profissaoFiltro]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (dateRange.inicio && dateRange.fim) {
        const createdAt = new Date(l.created_at);
        if (createdAt < dateRange.inicio || createdAt > dateRange.fim) return false;
      }
      if (ufFiltro !== "__all__" && l.uf !== ufFiltro) return false;
      if (profissaoFiltro !== "__all__" && l.profissao !== profissaoFiltro) return false;
      return true;
    });
  }, [leads, dateRange, ufFiltro, profissaoFiltro]);

  const filteredContratos = useMemo(() => {
    return contratos.filter(c => {
      if (tipoContratoFiltro !== "__all__" && c.tipo_contrato !== tipoContratoFiltro) return false;
      if (clienteFiltro !== "__all__" && getContratoClienteId(c) !== clienteFiltro) return false;
      if (ufFiltro !== "__all__") {
        const uf = c.profissional?.uf ?? c.ages_cliente?.uf ?? null;
        if (uf !== ufFiltro) return false;
      }
      if (profissaoFiltro !== "__all__" && c.profissional?.profissao !== profissaoFiltro) return false;
      return true;
    });
  }, [contratos, tipoContratoFiltro, clienteFiltro, ufFiltro, profissaoFiltro]);

  // ===== KPIs EXECUTIVOS =====
  const kpisExecutivos = useMemo(() => {
    const hoje = new Date();

    // Profissionais
    const profissionaisAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo');
    const profAtivosCount = profissionaisAtivos.length;
    const profComProducao = new Set(filteredProducao.map(p => p.profissional_id));
    const profissionaisOciosos = profissionaisAtivos.filter(p => !profComProducao.has(p.id)).length;

    // Produção
    const producaoTotalHoras = filteredProducao.reduce((sum, p) => sum + (p.total_horas || 0), 0);
    const capacidadeHoras = profAtivosCount * BASELINE_HORAS_MES;
    const capacidadeUtilizadaPerc = capacidadeHoras > 0 ? (producaoTotalHoras / capacidadeHoras) * 100 : 0;

    // Contratos
    const contratosAtivos = filteredContratos.filter(c => normalizeStatus(c.status) === 'ativo');
    const contratosAtivosCount = contratosAtivos.length;
    const contratosLicitacao = contratosAtivos.filter(c => normalizeTipoContrato(c.tipo_contrato) === 'licitacao').length;
    const contratosDispensa = contratosAtivos.filter(c => normalizeTipoContrato(c.tipo_contrato) === 'dispensa').length;

    // Valores
    const receitaAtivaTotal = contratosAtivos.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
    const ticketMedio = contratosAtivosCount > 0 ? receitaAtivaTotal / contratosAtivosCount : 0;

    // Receita em risco (contratos vencendo em 60 dias)
    const contratosEmRisco = contratosAtivos.filter(c => {
      if (!c.data_fim) return false;
      const fim = new Date(c.data_fim);
      const diff = differenceInDays(fim, hoje);
      return diff >= 0 && diff <= 60;
    });
    const receitaEmRisco = contratosEmRisco.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);

    // Contratos vencidos
    const contratosVencidos = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      return new Date(c.data_fim) < hoje;
    });
    const contratosVencidosCount = contratosVencidos.length;
    const valorVencido = contratosVencidos.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);

    // A vencer 30 dias
    const contratosVencer30 = contratosAtivos.filter(c => {
      if (!c.data_fim) return false;
      const diff = differenceInDays(new Date(c.data_fim), hoje);
      return diff >= 0 && diff <= 30;
    });

    // Dependência de licitações
    const receitaLicitacao = contratosAtivos
      .filter(c => normalizeTipoContrato(c.tipo_contrato) === 'licitacao')
      .reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
    const dependenciaLicitacaoPerc = receitaAtivaTotal > 0 ? (receitaLicitacao / receitaAtivaTotal) * 100 : 0;

    // Produção pendente validação
    const producaoPendenteHoras = filteredProducao
      .filter(p => {
        const s = normalizeStatus(p.status_conferencia);
        return s !== 'conferido' && s !== 'aprovado';
      })
      .reduce((sum, p) => sum + (p.total_horas || 0), 0);

    // Contratos com baixa execução
    const producaoByProfCliente = new Map<string, number>();
    for (const p of filteredProducao) {
      const key = `${p.profissional_id}::${p.ages_cliente_id || 'null'}`;
      producaoByProfCliente.set(key, (producaoByProfCliente.get(key) || 0) + (p.total_horas || 0));
    }
    const contratosBaixaExecucao = contratosAtivos.filter(c => {
      const key = `${c.profissional_id || 'null'}::${getContratoClienteId(c) || 'null'}`;
      const horas = producaoByProfCliente.get(key) || 0;
      const capacidade = c.carga_horaria_mensal ?? BASELINE_HORAS_MES;
      const execucao = capacidade > 0 ? (horas / capacidade) * 100 : 0;
      return execucao > 0 && execucao < 50;
    }).length;

    // Risco operacional
    const pctPendente = producaoTotalHoras > 0 ? (producaoPendenteHoras / producaoTotalHoras) * 100 : 0;
    const pctBaixaExec = contratosAtivosCount > 0 ? (contratosBaixaExecucao / contratosAtivosCount) * 100 : 0;
    const pctOciosos = profAtivosCount > 0 ? (profissionaisOciosos / profAtivosCount) * 100 : 0;
    const riscoOperacional = pctPendente * 0.5 + pctBaixaExec * 0.3 + pctOciosos * 0.2;

    // Leads
    const leadsConvertidos = filteredLeads.filter(l => normalizeStatus(l.status) === 'convertido').length;
    const leadsTotal = filteredLeads.length;
    const taxaConversaoLeads = leadsTotal > 0 ? (leadsConvertidos / leadsTotal) * 100 : 0;

    return {
      // Profissionais
      profissionaisAtivos: profAtivosCount,
      profissionaisOciosos,
      
      // Produção
      producaoTotalHoras,
      capacidadeUtilizadaPerc,
      producaoPendenteHoras,
      
      // Contratos
      contratosAtivos: contratosAtivosCount,
      contratosLicitacao,
      contratosDispensa,
      contratosVencidosCount,
      valorVencido,
      contratosVencer30Count: contratosVencer30.length,
      contratosBaixaExecucao,
      
      // Financeiro
      receitaAtivaTotal,
      receitaEmRisco,
      ticketMedio,
      dependenciaLicitacaoPerc,
      
      // Operacional
      riscoOperacional,
      
      // Pipeline
      taxaConversaoLeads,
      leadsTotal,
      leadsConvertidos,
    };
  }, [profissionais, contratos, filteredProducao, filteredLeads, filteredContratos]);

  // ===== KPIs LICITAÇÕES/COMPETITIVIDADE AGES =====
  const kpisLicitacoes = useMemo(() => {
    // Licitações AGES
    const licitacoesTotal = agesLicitacoes.length;
    const licitacoesEmDisputa = agesLicitacoes.filter(al => {
      const status = al.licitacao?.status?.toLowerCase() || '';
      return ['em análise', 'em disputa', 'aguardando', 'cadastro'].some(s => status.includes(s));
    }).length;

    const licitacoesGanhas = agesLicitacoes.filter(al => {
      const resultado = al.licitacao?.resultado?.toLowerCase() || '';
      return resultado.includes('ganha') || resultado === 'vitória';
    }).length;

    const licitacoesPerdidas = agesLicitacoes.filter(al => {
      const resultado = al.licitacao?.resultado?.toLowerCase() || '';
      return resultado.includes('perdi') || resultado === 'perda';
    }).length;

    const licitacoesEncerradas = licitacoesGanhas + licitacoesPerdidas;
    const taxaConversaoLicitacoes = licitacoesEncerradas > 0 
      ? (licitacoesGanhas / licitacoesEncerradas) * 100 
      : 0;

    const valorPipeline = agesLicitacoes
      .filter(al => {
        const status = al.licitacao?.status?.toLowerCase() || '';
        return !['encerrada', 'cancelada', 'deserta'].some(s => status.includes(s));
      })
      .reduce((sum, al) => {
        const valor = parseFloat(al.licitacao?.valor_estimado || '0') || 0;
        return sum + valor;
      }, 0);

    const valorConvertido = agesLicitacoes
      .filter(al => {
        const resultado = al.licitacao?.resultado?.toLowerCase() || '';
        return resultado.includes('ganha');
      })
      .reduce((sum, al) => {
        const valor = parseFloat(al.licitacao?.valor_estimado || '0') || 0;
        return sum + valor;
      }, 0);

    // Competitividade (itens de licitação AGES)
    let rankingSoma = 0;
    let rankingCount = 0;
    let vitoriasGSS = 0;
    let participacoesGSS = 0;
    let diferencaPrecoSoma = 0;
    let diferencaPrecoCount = 0;

    licitacaoItens.forEach(item => {
      const concorrentes = item.licitacao_item_concorrentes || [];
      const gss = concorrentes.find(c => c.is_gss);
      const vencedor = concorrentes.find(c => c.is_vencedor);

      if (gss) {
        participacoesGSS++;
        rankingSoma += gss.posicao;
        rankingCount++;

        if (gss.is_vencedor) {
          vitoriasGSS++;
        }

        if (vencedor && vencedor.valor_ofertado > 0 && !gss.is_vencedor) {
          const diff = ((gss.valor_ofertado - vencedor.valor_ofertado) / vencedor.valor_ofertado) * 100;
          diferencaPrecoSoma += diff;
          diferencaPrecoCount++;
        }
      }
    });

    const rankingMedio = rankingCount > 0 ? rankingSoma / rankingCount : 0;
    const taxaVitoriaItens = participacoesGSS > 0 ? (vitoriasGSS / participacoesGSS) * 100 : 0;
    const diferencaPrecoMedia = diferencaPrecoCount > 0 ? diferencaPrecoSoma / diferencaPrecoCount : 0;

    return {
      licitacoesTotal,
      licitacoesEmDisputa,
      licitacoesGanhas,
      licitacoesPerdidas,
      taxaConversaoLicitacoes,
      valorPipeline,
      valorConvertido,
      
      // Competitividade
      itensAnalisados: licitacaoItens.length,
      participacoesGSS,
      vitoriasGSS,
      rankingMedio,
      taxaVitoriaItens,
      diferencaPrecoMedia,
    };
  }, [agesLicitacoes, licitacaoItens]);

  // ===== CHARTS =====
  const charts = useMemo(() => {
    // Produção por profissional (Top 10)
    const prodPorProf = new Map<string, { id: string; nome: string; horas: number }>();
    for (const p of filteredProducao) {
      const cur = prodPorProf.get(p.profissional_id) || {
        id: p.profissional_id,
        nome: p.profissional?.nome || '—',
        horas: 0,
      };
      cur.horas += (p.total_horas || 0);
      prodPorProf.set(p.profissional_id, cur);
    }
    const producaoPorProfissional = Array.from(prodPorProf.values())
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);

    // Produção por cliente (Top 10)
    const prodPorCliente = new Map<string, { id: string; nome: string; horas: number }>();
    for (const p of filteredProducao) {
      const cid = p.ages_cliente_id;
      if (!cid) continue;
      const cur = prodPorCliente.get(cid) || {
        id: cid,
        nome: p.ages_cliente?.nome_empresa || '—',
        horas: 0,
      };
      cur.horas += (p.total_horas || 0);
      prodPorCliente.set(cid, cur);
    }
    const producaoPorCliente = Array.from(prodPorCliente.values())
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);

    // Receita por tipo de contrato
    const contratosAtivos = filteredContratos.filter(c => normalizeStatus(c.status) === 'ativo');
    const receitaPorTipo: Record<string, number> = {};
    contratosAtivos.forEach(c => {
      const tipo = c.tipo_contrato || 'Outros';
      receitaPorTipo[tipo] = (receitaPorTipo[tipo] || 0) + (c.valor_mensal || 0);
    });
    const receitaPorTipoData = Object.entries(receitaPorTipo)
      .map(([tipo, valor]) => ({ tipo, valor }))
      .sort((a, b) => b.valor - a.valor);

    // Evolução produção mensal
    const evolucaoProducao: Record<string, { horas: number; registros: number }> = {};
    producao.forEach(p => {
      const monthKey = `${p.ano_referencia}-${String(p.mes_referencia).padStart(2, '0')}`;
      if (!evolucaoProducao[monthKey]) {
        evolucaoProducao[monthKey] = { horas: 0, registros: 0 };
      }
      evolucaoProducao[monthKey].horas += p.total_horas;
      evolucaoProducao[monthKey].registros += 1;
    });
    const evolucaoProducaoData = Object.entries(evolucaoProducao)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, val]) => {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return {
          mes: format(date, 'MMM/yy', { locale: ptBR }),
          horas: val.horas,
        };
      });

    // Ranking GSS por tipo de item
    const rankingPorTipo: Record<string, { soma: number; count: number }> = {};
    const vitoriaPorTipo: Record<string, { vitorias: number; total: number }> = {};
    
    licitacaoItens.forEach(item => {
      const concorrentes = item.licitacao_item_concorrentes || [];
      const gss = concorrentes.find(c => c.is_gss);
      const tipo = item.tipo || 'outro';

      if (!rankingPorTipo[tipo]) rankingPorTipo[tipo] = { soma: 0, count: 0 };
      if (!vitoriaPorTipo[tipo]) vitoriaPorTipo[tipo] = { vitorias: 0, total: 0 };

      if (gss) {
        rankingPorTipo[tipo].soma += gss.posicao;
        rankingPorTipo[tipo].count++;
        vitoriaPorTipo[tipo].total++;
        if (gss.is_vencedor) vitoriaPorTipo[tipo].vitorias++;
      }
    });

    const rankingPorTipoData = Object.entries(rankingPorTipo)
      .filter(([_, v]) => v.count > 0)
      .map(([tipo, v]) => ({
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
        ranking: v.soma / v.count,
      }))
      .sort((a, b) => a.ranking - b.ranking);

    const taxaVitoriaPorTipoData = Object.entries(vitoriaPorTipo)
      .filter(([_, v]) => v.total > 0)
      .map(([tipo, v]) => ({
        tipo: tipo.charAt(0).toUpperCase() + tipo.slice(1),
        vitorias: v.vitorias,
        perdas: v.total - v.vitorias,
        taxa: (v.vitorias / v.total) * 100,
      }))
      .sort((a, b) => b.taxa - a.taxa);

    // Pipeline leads
    const statusCounts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const status = normalizeStatus(l.status) || 'novo';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    const pipeline = FUNNEL_STAGES.map(stage => ({
      id: stage.id,
      label: stage.label,
      quantidade: stage.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0),
    }));

    // Top concorrentes AGES
    const concorrentesVitorias: Record<string, { nome: string; vitorias: number; disputas: number }> = {};
    licitacaoItens.forEach(item => {
      const concorrentes = item.licitacao_item_concorrentes || [];
      const gss = concorrentes.find(c => c.is_gss);
      const vencedor = concorrentes.find(c => c.is_vencedor);

      if (gss) {
        concorrentes.filter(c => !c.is_gss).forEach(c => {
          const nome = c.empresa_nome;
          if (!concorrentesVitorias[nome]) {
            concorrentesVitorias[nome] = { nome, vitorias: 0, disputas: 0 };
          }
          concorrentesVitorias[nome].disputas++;
        });
      }
      if (vencedor && !vencedor.is_gss) {
        const nome = vencedor.empresa_nome;
        if (!concorrentesVitorias[nome]) {
          concorrentesVitorias[nome] = { nome, vitorias: 0, disputas: 0 };
        }
        concorrentesVitorias[nome].vitorias++;
      }
    });
    const topConcorrentes = Object.values(concorrentesVitorias)
      .sort((a, b) => b.vitorias - a.vitorias)
      .slice(0, 8);

    // Concentração Top 3 clientes
    const totalReceita = contratosAtivos.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
    const receitaPorCliente: Record<string, { id: string; nome: string; valor: number }> = {};
    contratosAtivos.forEach(c => {
      const cid = getContratoClienteId(c);
      if (!cid) return;
      if (!receitaPorCliente[cid]) {
        receitaPorCliente[cid] = { id: cid, nome: c.ages_cliente?.nome_empresa || '—', valor: 0 };
      }
      receitaPorCliente[cid].valor += c.valor_mensal || 0;
    });
    const topClientes = Object.values(receitaPorCliente).sort((a, b) => b.valor - a.valor).slice(0, 3);
    const concentracaoTop3 = totalReceita > 0 
      ? (topClientes.reduce((sum, c) => sum + c.valor, 0) / totalReceita) * 100 
      : 0;

    return {
      producaoPorProfissional,
      producaoPorCliente,
      receitaPorTipoData,
      evolucaoProducaoData,
      rankingPorTipoData,
      taxaVitoriaPorTipoData,
      pipeline,
      topConcorrentes,
      topClientes,
      concentracaoTop3,
    };
  }, [filteredProducao, filteredContratos, filteredLeads, producao, licitacaoItens]);

  // ===== ALERTAS ESTRATÉGICOS =====
  const alertas = useMemo((): AlertaAges360[] => {
    const alertasList: AlertaAges360[] = [];
    const hoje = new Date();

    // 1. Contratos vencidos
    const contratosVencidos = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      return new Date(c.data_fim) < hoje;
    });
    if (contratosVencidos.length > 0) {
      const valor = contratosVencidos.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
      alertasList.push({
        id: 'contratos_vencidos',
        tipo: 'risco',
        titulo: `${contratosVencidos.length} contrato(s) vencido(s)`,
        descricao: `Valor mensal em risco: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`,
        valor,
        acao: 'Revisar contratos urgentes'
      });
    }

    // 2. Contratos a vencer (30 dias)
    const contratosVencer = contratos.filter(c => {
      if (!c.data_fim || normalizeStatus(c.status) !== 'ativo') return false;
      const diff = differenceInDays(new Date(c.data_fim), hoje);
      return diff >= 0 && diff <= 30;
    });
    if (contratosVencer.length > 0) {
      const valor = contratosVencer.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);
      alertasList.push({
        id: 'contratos_vencer',
        tipo: 'atencao',
        titulo: `${contratosVencer.length} contrato(s) vencendo em 30 dias`,
        descricao: `Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}`,
        valor,
        acao: 'Iniciar renovação'
      });
    }

    // 3. Profissionais sem produção
    const profissionaisAtivos = profissionais.filter(p => normalizeStatus(p.status) === 'ativo');
    const profComProducao = new Set(filteredProducao.map(p => p.profissional_id));
    const profSemProducao = profissionaisAtivos.filter(p => !profComProducao.has(p.id));
    if (profSemProducao.length > 0 && filteredProducao.length > 0) {
      alertasList.push({
        id: 'sem_producao',
        tipo: 'atencao',
        titulo: `${profSemProducao.length} profissional(is) sem produção`,
        descricao: 'Profissionais ativos sem lançamento no período selecionado.',
        acao: 'Verificar alocação'
      });
    }

    // 4. Concentração de receita
    if (charts.concentracaoTop3 > 60) {
      alertasList.push({
        id: 'concentracao_receita',
        tipo: 'atencao',
        titulo: 'Alta concentração de receita',
        descricao: `Top 3 clientes representam ${charts.concentracaoTop3.toFixed(0)}% do faturamento.`,
        acao: 'Diversificar carteira'
      });
    }

    // 5. Baixa taxa de conversão em licitações
    if (kpisLicitacoes.taxaConversaoLicitacoes < 20 && kpisLicitacoes.licitacoesGanhas + kpisLicitacoes.licitacoesPerdidas >= 3) {
      alertasList.push({
        id: 'baixa_conversao_licitacoes',
        tipo: 'risco',
        titulo: 'Baixa conversão em licitações AGES',
        descricao: `Taxa de ${kpisLicitacoes.taxaConversaoLicitacoes.toFixed(1)}% com ${kpisLicitacoes.licitacoesPerdidas} perdas.`,
        acao: 'Revisar estratégia'
      });
    }

    // 6. Ranking médio alto (competitividade baixa)
    if (kpisLicitacoes.rankingMedio > 3 && kpisLicitacoes.participacoesGSS >= 3) {
      alertasList.push({
        id: 'ranking_alto',
        tipo: 'atencao',
        titulo: 'Baixa competitividade em licitações',
        descricao: `Ranking médio de ${kpisLicitacoes.rankingMedio.toFixed(1)}º posição nos itens AGES.`,
        acao: 'Analisar preços'
      });
    }

    // 7. Leads parados
    const leadsParados = leads.filter(l => {
      if (['convertido', 'perdido'].includes(normalizeStatus(l.status))) return false;
      return differenceInDays(hoje, new Date(l.updated_at)) > 15;
    });
    if (leadsParados.length > 0) {
      alertasList.push({
        id: 'leads_parados',
        tipo: 'atencao',
        titulo: `${leadsParados.length} lead(s) sem movimentação`,
        descricao: 'Leads sem atualização há mais de 15 dias.',
        acao: 'Retomar contato'
      });
    }

    // 8. Oportunidade de renovação
    const clientesComContratosVencendo = new Set(contratosVencer.filter(c => c.ages_cliente_id).map(c => c.ages_cliente_id)).size;
    if (clientesComContratosVencendo > 0) {
      alertasList.push({
        id: 'oportunidade_renovacao',
        tipo: 'oportunidade',
        titulo: `${clientesComContratosVencendo} cliente(s) para renovação`,
        descricao: 'Oportunidade de manter relacionamento.',
        acao: 'Iniciar negociação'
      });
    }

    // 9. Gargalo operacional - produção pendente
    if (kpisExecutivos.producaoPendenteHoras > 100) {
      alertasList.push({
        id: 'producao_pendente',
        tipo: 'atencao',
        titulo: 'Produção pendente de validação',
        descricao: `${Math.round(kpisExecutivos.producaoPendenteHoras)} horas aguardando conferência.`,
        acao: 'Conferir registros'
      });
    }

    return alertasList;
  }, [contratos, profissionais, leads, filteredProducao, charts.concentracaoTop3, kpisLicitacoes, kpisExecutivos]);

  return {
    // Filters
    periodoRapido, setPeriodoRapido,
    dataInicio, setDataInicio, dataFim, setDataFim,
    ufFiltro, setUfFiltro,
    clienteFiltro, setClienteFiltro,
    tipoContratoFiltro, setTipoContratoFiltro,
    profissaoFiltro, setProfissaoFiltro,
    filterOptions,
    
    // Loading
    isLoading,
    
    // KPIs
    kpisExecutivos,
    kpisLicitacoes,
    
    // Charts
    charts,
    
    // Alertas
    alertas,
  };
}
