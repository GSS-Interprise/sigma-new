import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, addMonths, addDays, differenceInDays, format, parseISO, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "personalizado";
export type FiltroRapido = "todos" | "ativos" | "com_pendencia" | "inativos";

interface Medico {
  id: string;
  nome_completo: string;
  crm: string;
  email: string;
  telefone: string;
  estado: string | null;
  especialidade: string[] | null;
  status_medico: string | null;
  status_documentacao: string | null;
  status_contrato: string | null;
  created_at: string;
  updated_at: string;
}

interface MedicoDocumento {
  id: string;
  medico_id: string;
  tipo_documento: string;
  data_validade: string | null;
  medico?: { nome_completo: string };
}

// Brazilian states for region data
const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins'
};

// Normalizar nomes de especialidades
const normalizeEspecialidade = (esp: string): string => {
  const normalized = esp.trim();
  const first = normalized.charAt(0).toUpperCase();
  const rest = normalized.slice(1).toLowerCase();
  return first + rest;
};

export function useMedicosBI() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("trimestre");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ufFiltro, setUfFiltro] = useState("all");
  const [especialidadeFiltro, setEspecialidadeFiltro] = useState("all");
  const [statusFiltro, setStatusFiltro] = useState("all");
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("todos");
  const [mostrarApenasAptos, setMostrarApenasAptos] = useState(false);

  // Calculate date range based on quick period selection
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
      case "personalizado":
        return {
          inicio: dataInicio ? new Date(dataInicio) : null,
          fim: dataFim ? new Date(dataFim) : null
        };
      default:
        return { inicio: null, fim: null };
    }
  }, [periodoRapido, dataInicio, dataFim]);

  // Previous period for comparison
  const previousPeriodRange = useMemo(() => {
    if (!dateRange.inicio || !dateRange.fim) return null;
    const duration = differenceInDays(dateRange.fim, dateRange.inicio);
    const inicio = subMonths(dateRange.inicio, Math.ceil(duration / 30));
    const fim = subMonths(dateRange.fim, Math.ceil(duration / 30));
    return { inicio, fim };
  }, [dateRange]);

  // Fetch all doctors
  const { data: medicos = [], isLoading: isLoadingMedicos } = useQuery({
    queryKey: ['medicos-bi-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Medico[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch documents with expiration dates
  const { data: documentos = [], isLoading: isLoadingDocs } = useQuery({
    queryKey: ['medicos-documentos-bi'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medico_documentos')
        .select('id, medico_id, tipo_documento, data_validade, medicos(nome_completo)')
        .not('data_validade', 'is', null);
      
      if (error) throw error;
      return (data || []) as MedicoDocumento[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const isLoading = isLoadingMedicos || isLoadingDocs;

  // Helper: médico está apto (ativo + sem pendências críticas)
  const isMedicoApto = useCallback((m: Medico) => {
    const statusAtivo = m.status_medico?.toLowerCase() === 'ativo';
    const docOk = m.status_documentacao?.toLowerCase() === 'aprovada' || 
                  m.status_documentacao?.toLowerCase() === 'completa' ||
                  m.status_documentacao?.toLowerCase() === 'aprovado';
    return statusAtivo && docOk;
  }, []);

  // Helper: médico tem pendência
  const temPendencia = useCallback((m: Medico) => {
    const docPendente = m.status_documentacao?.toLowerCase() === 'pendente' || 
                        m.status_documentacao?.toLowerCase() === 'incompleta';
    return docPendente;
  }, []);

  // Get unique filter options (normalized)
  const filterOptions = useMemo(() => {
    const ufs = new Set<string>();
    const especialidades = new Map<string, string>(); // normalized -> original
    
    medicos.forEach(m => {
      if (m.estado) ufs.add(m.estado.toUpperCase());
      if (m.especialidade) {
        m.especialidade.forEach(e => {
          const normalized = normalizeEspecialidade(e);
          if (!especialidades.has(normalized.toLowerCase())) {
            especialidades.set(normalized.toLowerCase(), normalized);
          }
        });
      }
    });
    
    return {
      ufs: Array.from(ufs).sort(),
      especialidades: Array.from(especialidades.values()).sort()
    };
  }, [medicos]);

  // Filter doctors based on all filters
  const filteredMedicos = useMemo(() => {
    return medicos.filter(m => {
      // Quick filter
      if (filtroRapido === "ativos" && m.status_medico?.toLowerCase() !== 'ativo') return false;
      if (filtroRapido === "com_pendencia" && !temPendencia(m)) return false;
      if (filtroRapido === "inativos" && m.status_medico?.toLowerCase() !== 'inativo') return false;
      
      // Only apt doctors
      if (mostrarApenasAptos && !isMedicoApto(m)) return false;
      
      // UF filter
      if (ufFiltro !== "all" && m.estado?.toUpperCase() !== ufFiltro.toUpperCase()) return false;
      
      // Specialty filter (normalized)
      if (especialidadeFiltro !== "all") {
        const normalizedFilter = normalizeEspecialidade(especialidadeFiltro).toLowerCase();
        const hasSpec = m.especialidade?.some(e => 
          normalizeEspecialidade(e).toLowerCase() === normalizedFilter
        );
        if (!hasSpec) return false;
      }
      
      // Status filter
      if (statusFiltro !== "all" && m.status_medico?.toLowerCase() !== statusFiltro.toLowerCase()) return false;
      
      return true;
    });
  }, [medicos, filtroRapido, mostrarApenasAptos, ufFiltro, especialidadeFiltro, statusFiltro, isMedicoApto, temPendencia]);

  // Doctors created in current period
  const currentPeriodMedicos = useMemo(() => {
    if (!dateRange.inicio || !dateRange.fim) return medicos;
    return medicos.filter(m => {
      const createdAt = new Date(m.created_at);
      return createdAt >= dateRange.inicio! && createdAt <= dateRange.fim!;
    });
  }, [medicos, dateRange]);

  // Doctors created in previous period
  const previousPeriodMedicos = useMemo(() => {
    if (!previousPeriodRange) return [];
    return medicos.filter(m => {
      const createdAt = new Date(m.created_at);
      return createdAt >= previousPeriodRange.inicio && createdAt <= previousPeriodRange.fim;
    });
  }, [medicos, previousPeriodRange]);

  // Count specialties with deficit (< 3 active doctors)
  const especialidadesEmDeficit = useMemo(() => {
    const counts: Record<string, { total: number; ativos: number }> = {};
    
    medicos.forEach(m => {
      if (m.especialidade) {
        m.especialidade.forEach(e => {
          const normalized = normalizeEspecialidade(e);
          if (!counts[normalized]) counts[normalized] = { total: 0, ativos: 0 };
          counts[normalized].total++;
          if (m.status_medico?.toLowerCase() === 'ativo') {
            counts[normalized].ativos++;
          }
        });
      }
    });
    
    return Object.entries(counts)
      .filter(([_, v]) => v.ativos < 3)
      .map(([esp, v]) => ({ especialidade: esp, ativos: v.ativos, total: v.total }))
      .sort((a, b) => a.ativos - b.ativos);
  }, [medicos]);

  // KPIs estratégicos
  const kpis = useMemo(() => {
    // Médicos Aptos (ativos + documentação ok)
    const medicosAptos = medicos.filter(isMedicoApto).length;
    const medicosAptosAnterior = previousPeriodMedicos.filter(isMedicoApto).length;
    
    // Total cadastrados
    const totalCadastrados = medicos.length;
    
    // Novos no período
    const novosNoPeriodo = currentPeriodMedicos.length;
    const novosAnterior = previousPeriodMedicos.length;
    
    // Crescimento líquido (entradas - saídas/inativos no período)
    const inativos = currentPeriodMedicos.filter(m => 
      m.status_medico?.toLowerCase() === 'inativo' || 
      m.status_medico?.toLowerCase() === 'suspenso'
    ).length;
    const crescimentoLiquido = novosNoPeriodo - inativos;
    const inativosAnterior = previousPeriodMedicos.filter(m => 
      m.status_medico?.toLowerCase() === 'inativo' || 
      m.status_medico?.toLowerCase() === 'suspenso'
    ).length;
    const crescimentoAnterior = novosAnterior - inativosAnterior;
    
    // Médicos com pendência de documentação
    const comPendenciaDoc = medicos.filter(temPendencia).length;
    
    // Especialidades em déficit
    const especialidadesDeficit = especialidadesEmDeficit.length;
    
    // Médicos inativos/bloqueados
    const medicosInativos = medicos.filter(m => 
      m.status_medico?.toLowerCase() === 'inativo' || 
      m.status_medico?.toLowerCase() === 'suspenso' ||
      m.status_medico?.toLowerCase() === 'bloqueado'
    ).length;
    
    // Variações
    const variacaoAptos = medicosAptosAnterior > 0 
      ? ((medicosAptos - medicosAptosAnterior) / medicosAptosAnterior) * 100 
      : 0;
    
    const variacaoNovos = novosAnterior > 0 
      ? ((novosNoPeriodo - novosAnterior) / novosAnterior) * 100 
      : 0;
    
    const variacaoCrescimento = crescimentoAnterior !== 0 
      ? ((crescimentoLiquido - crescimentoAnterior) / Math.abs(crescimentoAnterior)) * 100 
      : 0;
    
    // Percentual aptos vs não aptos
    const percentualAptos = totalCadastrados > 0 ? (medicosAptos / totalCadastrados) * 100 : 0;
    
    // Médicos que impedem atendimento
    const impedemAtendimento = comPendenciaDoc + medicosInativos;
    
    return {
      medicosAptos,
      totalCadastrados,
      novosNoPeriodo,
      crescimentoLiquido,
      comPendenciaDoc,
      especialidadesDeficit,
      medicosInativos,
      variacaoAptos,
      variacaoNovos,
      variacaoCrescimento,
      percentualAptos,
      impedemAtendimento
    };
  }, [medicos, currentPeriodMedicos, previousPeriodMedicos, isMedicoApto, temPendencia, especialidadesEmDeficit]);

  // Status de Cadastro (Aprovados, Pendentes, Reprovados, Aguardando)
  const statusCadastroData = useMemo(() => {
    const counts = {
      aprovados: 0,
      pendentes: 0,
      reprovados: 0,
      aguardando: 0
    };
    
    filteredMedicos.forEach(m => {
      const status = m.status_documentacao?.toLowerCase() || 'pendente';
      if (status === 'aprovada' || status === 'aprovado' || status === 'completa') {
        counts.aprovados++;
      } else if (status === 'pendente' || status === 'incompleta') {
        counts.pendentes++;
      } else if (status === 'reprovada' || status === 'reprovado') {
        counts.reprovados++;
      } else {
        counts.aguardando++;
      }
    });
    
    const total = filteredMedicos.length;
    const aptosPercentual = total > 0 ? (counts.aprovados / total) * 100 : 0;
    const naoAptosPercentual = total > 0 ? ((counts.pendentes + counts.reprovados + counts.aguardando) / total) * 100 : 0;
    
    return {
      lista: [
        { 
          status: 'Aprovados', 
          quantidade: counts.aprovados, 
          percentual: total > 0 ? (counts.aprovados / total) * 100 : 0,
          impacto: 'Médicos prontos para atendimento'
        },
        { 
          status: 'Pendentes', 
          quantidade: counts.pendentes, 
          percentual: total > 0 ? (counts.pendentes / total) * 100 : 0,
          impacto: 'Aguardando documentação - não podem atender'
        },
        { 
          status: 'Reprovados', 
          quantidade: counts.reprovados, 
          percentual: total > 0 ? (counts.reprovados / total) * 100 : 0,
          impacto: 'Documentação rejeitada - requer ação'
        },
        { 
          status: 'Aguardando Análise', 
          quantidade: counts.aguardando, 
          percentual: total > 0 ? (counts.aguardando / total) * 100 : 0,
          impacto: 'Em análise pela equipe'
        }
      ],
      aptosPercentual,
      naoAptosPercentual
    };
  }, [filteredMedicos]);

  // Riscos Operacionais
  const riscosOperacionais = useMemo(() => {
    const hoje = new Date();
    const em30Dias = addDays(hoje, 30);
    const em60Dias = addDays(hoje, 60);
    const em90Dias = addDays(hoje, 90);
    
    // Cadastro pendente
    const cadastroPendente = medicos.filter(temPendencia).length;
    
    // Documentos expirando
    const docs30 = documentos.filter(doc => {
      if (!doc.data_validade) return false;
      const validade = new Date(doc.data_validade);
      return validade >= hoje && validade <= em30Dias;
    });
    
    const docs60 = documentos.filter(doc => {
      if (!doc.data_validade) return false;
      const validade = new Date(doc.data_validade);
      return validade > em30Dias && validade <= em60Dias;
    });
    
    const docs90 = documentos.filter(doc => {
      if (!doc.data_validade) return false;
      const validade = new Date(doc.data_validade);
      return validade > em60Dias && validade <= em90Dias;
    });
    
    // Lista detalhada de docs expirando
    const docsExpirandoLista = docs30.map(doc => ({
      id: doc.id,
      medicoId: doc.medico_id,
      tipoDocumento: doc.tipo_documento,
      dataValidade: doc.data_validade,
      diasRestantes: differenceInDays(new Date(doc.data_validade!), hoje)
    })).sort((a, b) => a.diasRestantes - b.diasRestantes);
    
    // Médicos com pendências críticas (doc pendente OU doc expirando em 30d)
    const medicosComDocExpirando = new Set(docs30.map(d => d.medico_id));
    const medicosComPendenciasCriticas = medicos.filter(m => 
      temPendencia(m) || medicosComDocExpirando.has(m.id)
    ).length;
    
    // Especialidades em déficit
    const especialidadesDeficit = especialidadesEmDeficit.slice(0, 5);
    
    // Mensagem de impacto
    const impedemAtendimento = medicosComPendenciasCriticas;
    
    return {
      cadastroPendente,
      docs30: docs30.length,
      docs60: docs60.length,
      docs90: docs90.length,
      docsExpirandoLista: docsExpirandoLista.slice(0, 8),
      medicosComPendenciasCriticas,
      especialidadesDeficit,
      impedemAtendimento
    };
  }, [medicos, documentos, temPendencia, especialidadesEmDeficit]);

  // Distribuição por Região
  const regiaoData = useMemo(() => {
    const sourceMedicos = mostrarApenasAptos ? medicos.filter(isMedicoApto) : filteredMedicos;
    const counts: Record<string, { total: number; ativos: number }> = {};
    
    sourceMedicos.forEach(m => {
      const uf = m.estado?.toUpperCase() || 'N/I';
      if (!counts[uf]) counts[uf] = { total: 0, ativos: 0 };
      counts[uf].total++;
      if (m.status_medico?.toLowerCase() === 'ativo') {
        counts[uf].ativos++;
      }
    });
    
    const totalMedicos = sourceMedicos.length;
    
    return Object.entries(counts)
      .map(([uf, v]) => ({
        uf,
        nome: UF_NAMES[uf] || uf,
        total: v.total,
        ativos: v.ativos,
        percentual: totalMedicos > 0 ? (v.total / totalMedicos) * 100 : 0,
        isCritico: v.ativos <= 1 && v.ativos > 0,
        isBaixo: v.ativos <= 3 && v.ativos > 1
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredMedicos, medicos, mostrarApenasAptos, isMedicoApto]);

  // Especialidades (normalizado + total vs ativos + déficit)
  const especialidadeData = useMemo(() => {
    const counts: Record<string, { total: number; ativos: number }> = {};
    const prevCounts: Record<string, number> = {};
    
    filteredMedicos.forEach(m => {
      if (m.especialidade) {
        m.especialidade.forEach(e => {
          const normalized = normalizeEspecialidade(e);
          if (!counts[normalized]) counts[normalized] = { total: 0, ativos: 0 };
          counts[normalized].total++;
          if (m.status_medico?.toLowerCase() === 'ativo') {
            counts[normalized].ativos++;
          }
        });
      }
    });
    
    previousPeriodMedicos.forEach(m => {
      if (m.especialidade) {
        m.especialidade.forEach(e => {
          const normalized = normalizeEspecialidade(e);
          prevCounts[normalized] = (prevCounts[normalized] || 0) + 1;
        });
      }
    });
    
    const totalEspecialidades = Object.values(counts).reduce((sum, v) => sum + v.total, 0);
    
    const sorted = Object.entries(counts)
      .map(([especialidade, v]) => {
        const prevQtd = prevCounts[especialidade] || 0;
        const variacao = prevQtd > 0 ? ((v.total - prevQtd) / prevQtd) * 100 : 0;
        const isDeficit = v.ativos < 3;
        
        return {
          especialidade,
          total: v.total,
          ativos: v.ativos,
          percentual: totalEspecialidades > 0 ? (v.total / totalEspecialidades) * 100 : 0,
          variacao,
          isDeficit
        };
      })
      .sort((a, b) => b.total - a.total);
    
    // Top 12 + Outros
    if (sorted.length > 12) {
      const top = sorted.slice(0, 12);
      const outros = sorted.slice(12).reduce((acc, curr) => ({
        especialidade: 'Outros',
        total: acc.total + curr.total,
        ativos: acc.ativos + curr.ativos,
        percentual: acc.percentual + curr.percentual,
        variacao: 0,
        isDeficit: false
      }), { especialidade: 'Outros', total: 0, ativos: 0, percentual: 0, variacao: 0, isDeficit: false });
      
      return [...top, outros];
    }
    
    return sorted;
  }, [filteredMedicos, previousPeriodMedicos]);

  // Evolução Mensal (Cadastros realizados, Aprovados, Bloqueados/Reprovados)
  const evolucaoMensal = useMemo(() => {
    const months: Record<string, { cadastrados: number; aprovados: number; bloqueados: number; date: Date }> = {};
    
    medicos.forEach(m => {
      const date = new Date(m.created_at);
      const monthKey = format(date, 'yyyy-MM');
      
      if (!months[monthKey]) {
        months[monthKey] = { cadastrados: 0, aprovados: 0, bloqueados: 0, date };
      }
      months[monthKey].cadastrados++;
      
      const docStatus = m.status_documentacao?.toLowerCase();
      if (docStatus === 'aprovada' || docStatus === 'aprovado' || docStatus === 'completa') {
        months[monthKey].aprovados++;
      } else if (docStatus === 'reprovada' || docStatus === 'reprovado') {
        months[monthKey].bloqueados++;
      }
    });
    
    // Sort and get last 12 months
    const sorted = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
    
    const data = sorted.map(([key, val]) => {
      const taxaAprovacao = val.cadastrados > 0 ? (val.aprovados / val.cadastrados) * 100 : 0;
      const impactoAtivos = val.aprovados; // Quantidade que virou médico ativo
      
      return {
        mes: format(val.date, 'MMM/yy', { locale: ptBR }),
        cadastrados: val.cadastrados,
        aprovados: val.aprovados,
        bloqueados: val.bloqueados,
        taxaAprovacao,
        impactoAtivos,
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
        sumY += d.cadastrados;
        sumXY += i * d.cadastrados;
        sumX2 += i * i;
      });
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      // Taxa média de aprovação dos últimos meses
      const avgTaxaAprovacao = recentData.reduce((sum, d) => sum + d.taxaAprovacao, 0) / n;
      
      for (let i = 1; i <= 2; i++) {
        const projectedDate = addMonths(new Date(), i);
        const projectedCadastrados = Math.max(0, Math.round(intercept + slope * (n + i - 1)));
        const projectedAprovados = Math.round(projectedCadastrados * (avgTaxaAprovacao / 100));
        
        data.push({
          mes: format(projectedDate, 'MMM/yy', { locale: ptBR }),
          cadastrados: projectedCadastrados,
          aprovados: projectedAprovados,
          bloqueados: 0,
          taxaAprovacao: avgTaxaAprovacao,
          impactoAtivos: projectedAprovados,
          isProjection: true
        });
      }
    }
    
    return data;
  }, [medicos]);

  // Alertas Inteligentes
  const alertas = useMemo(() => {
    const lista: { tipo: 'critico' | 'alerta' | 'atencao' | 'oportunidade'; titulo: string; descricao: string }[] = [];
    
    // Especialidades sem médicos ativos
    const espSemAtivos = especialidadesEmDeficit.filter(e => e.ativos === 0);
    espSemAtivos.forEach(esp => {
      lista.push({
        tipo: 'critico',
        titulo: `${esp.especialidade} sem médicos ativos`,
        descricao: `Nenhum médico ativo disponível para esta especialidade. Total cadastrados: ${esp.total}`
      });
    });
    
    // Regiões críticas (apenas 1 médico)
    const regioesCriticas = regiaoData.filter(r => r.isCritico && r.uf !== 'N/I');
    regioesCriticas.forEach(r => {
      lista.push({
        tipo: 'alerta',
        titulo: `${r.nome} com apenas 1 médico`,
        descricao: `Cobertura mínima - risco operacional alto em caso de ausência`
      });
    });
    
    // Crescimento de cadastro sem crescimento de ativos
    if (kpis.novosNoPeriodo > 5 && kpis.variacaoAptos < 5) {
      lista.push({
        tipo: 'atencao',
        titulo: 'Crescimento de cadastro sem conversão',
        descricao: `${kpis.novosNoPeriodo} novos cadastros no período, mas pouco impacto em médicos ativos (${kpis.variacaoAptos.toFixed(1)}%)`
      });
    }
    
    // Alto volume de pendências
    if (riscosOperacionais.cadastroPendente > 10) {
      lista.push({
        tipo: 'alerta',
        titulo: 'Alto volume de pendências',
        descricao: `${riscosOperacionais.cadastroPendente} médicos com documentação pendente travando operação`
      });
    }
    
    // Documentos expirando em 30 dias
    if (riscosOperacionais.docs30 > 5) {
      lista.push({
        tipo: 'critico',
        titulo: 'Documentos expirando em 30 dias',
        descricao: `${riscosOperacionais.docs30} documentos vencem nos próximos 30 dias - ação imediata necessária`
      });
    }
    
    // Oportunidade: alta taxa de aprovação
    const ultimosMeses = evolucaoMensal.filter(e => !e.isProjection).slice(-3);
    const mediaAprovacao = ultimosMeses.length > 0 
      ? ultimosMeses.reduce((sum, m) => sum + m.taxaAprovacao, 0) / ultimosMeses.length 
      : 0;
    if (mediaAprovacao > 80) {
      lista.push({
        tipo: 'oportunidade',
        titulo: 'Alta taxa de aprovação',
        descricao: `Taxa média de ${mediaAprovacao.toFixed(0)}% nos últimos meses - processo de cadastro eficiente`
      });
    }
    
    // Crescimento líquido negativo
    if (kpis.crescimentoLiquido < 0) {
      lista.push({
        tipo: 'critico',
        titulo: 'Crescimento líquido negativo',
        descricao: `Mais saídas do que entradas no período (${kpis.crescimentoLiquido})`
      });
    }
    
    return lista.slice(0, 6); // Max 6 alertas
  }, [especialidadesEmDeficit, regiaoData, kpis, riscosOperacionais, evolucaoMensal]);

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
    ufFiltro,
    setUfFiltro,
    especialidadeFiltro,
    setEspecialidadeFiltro,
    statusFiltro,
    setStatusFiltro,
    filtroRapido,
    setFiltroRapido,
    mostrarApenasAptos,
    setMostrarApenasAptos,
    filterOptions,
    
    // Loading state
    isLoading,
    
    // Data
    kpis,
    regiaoData,
    especialidadeData,
    statusCadastroData,
    riscosOperacionais,
    evolucaoMensal,
    alertas,
    especialidadesEmDeficit,
    totalMedicos: filteredMedicos.length
  };
}
