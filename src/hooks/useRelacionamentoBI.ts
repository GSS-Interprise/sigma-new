import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, differenceInDays, format, parseISO, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

// SLA em dias
const SLA_DIAS = 7;
const REINCIDENCIA_LIMITE = 2;

export interface RelacionamentoFilters {
  tipoInteracao: string;
  status: string;
  medicoId: string;
  slaStatus: string;
  apenasReclamacoes: boolean;
  apenasReincidencias: boolean;
}

export function useRelacionamentoBI() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [filters, setFilters] = useState<RelacionamentoFilters>({
    tipoInteracao: "",
    status: "",
    medicoId: "",
    slaStatus: "",
    apenasReclamacoes: false,
    apenasReincidencias: false,
  });

  // Período atual
  const { data: relacionamentos = [], isLoading } = useQuery({
    queryKey: ['relacionamentos-bi', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from('relacionamento_medico')
        .select('*, medicos(id, nome_completo)');
      
      if (dataInicio) {
        query = query.gte('created_at', dataInicio);
      }
      if (dataFim) {
        query = query.lte('created_at', `${dataFim}T23:59:59`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Período anterior para comparação
  const { data: relacionamentosPeriodoAnterior = [] } = useQuery({
    queryKey: ['relacionamentos-bi-anterior', dataInicio, dataFim],
    queryFn: async () => {
      if (!dataInicio || !dataFim) return [];
      
      const inicio = parseISO(dataInicio);
      const fim = parseISO(dataFim);
      const diasPeriodo = differenceInDays(fim, inicio) || 30;
      
      const inicioAnterior = format(subDays(inicio, diasPeriodo), 'yyyy-MM-dd');
      const fimAnterior = format(subDays(inicio, 1), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('relacionamento_medico')
        .select('*, medicos(id, nome_completo)')
        .gte('created_at', inicioAnterior)
        .lte('created_at', `${fimAnterior}T23:59:59`);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!dataInicio && !!dataFim
  });

  // Blacklist para alertas
  const { data: blacklist = [] } = useQuery({
    queryKey: ['blacklist-bi'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blacklist')
        .select('*');
      if (error) throw error;
      return data || [];
    }
  });

  // Dados filtrados
  const dadosFiltrados = useMemo(() => {
    let result = [...relacionamentos];
    const hoje = new Date();
    
    if (filters.tipoInteracao) {
      result = result.filter(r => r.tipo === filters.tipoInteracao || r.tipo_principal === filters.tipoInteracao);
    }
    
    if (filters.status) {
      result = result.filter(r => r.status === filters.status);
    }
    
    if (filters.medicoId) {
      result = result.filter(r => r.medico_vinculado_id === filters.medicoId);
    }
    
    if (filters.slaStatus === 'no_prazo') {
      result = result.filter(r => {
        if (r.status === 'concluida') return true;
        const dias = differenceInDays(hoje, new Date(r.created_at));
        return dias <= SLA_DIAS;
      });
    } else if (filters.slaStatus === 'atrasado') {
      result = result.filter(r => {
        if (r.status === 'concluida') return false;
        const dias = differenceInDays(hoje, new Date(r.created_at));
        return dias > SLA_DIAS;
      });
    }
    
    if (filters.apenasReclamacoes) {
      result = result.filter(r => r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação'));
    }
    
    return result;
  }, [relacionamentos, filters]);

  // Médicos reincidentes
  const medicosReincidentes = useMemo(() => {
    const contagem: Record<string, { count: number; nome: string; interacoes: any[] }> = {};
    
    relacionamentos.forEach(r => {
      if (r.medico_vinculado_id) {
        if (!contagem[r.medico_vinculado_id]) {
          contagem[r.medico_vinculado_id] = {
            count: 0,
            nome: r.medicos?.nome_completo || 'Desconhecido',
            interacoes: []
          };
        }
        contagem[r.medico_vinculado_id].count++;
        contagem[r.medico_vinculado_id].interacoes.push(r);
      }
    });
    
    return Object.entries(contagem)
      .filter(([_, data]) => data.count >= REINCIDENCIA_LIMITE)
      .map(([id, data]) => ({ id, ...data }));
  }, [relacionamentos]);

  // Dados filtrados por reincidência
  const dadosFinais = useMemo(() => {
    if (!filters.apenasReincidencias) return dadosFiltrados;
    const idsReincidentes = new Set(medicosReincidentes.map(m => m.id));
    return dadosFiltrados.filter(r => r.medico_vinculado_id && idsReincidentes.has(r.medico_vinculado_id));
  }, [dadosFiltrados, filters.apenasReincidencias, medicosReincidentes]);

  // KPIs
  const kpis = useMemo(() => {
    const hoje = new Date();
    const total = dadosFinais.length;
    const totalAnterior = relacionamentosPeriodoAnterior.length;
    
    const reclamacoesAbertas = dadosFinais.filter(r => 
      (r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')) && 
      r.status !== 'concluida'
    );
    
    const reclamacoesAbertasAnterior = relacionamentosPeriodoAnterior.filter(r => 
      (r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')) && 
      r.status !== 'concluida'
    );
    
    const acoesEmAndamento = dadosFinais.filter(r => 
      r.status === 'em_analise' || r.status === 'em_progresso' || r.status === 'aberta'
    );
    
    const concluidas = dadosFinais.filter(r => r.status === 'concluida');
    const concluidasAnterior = relacionamentosPeriodoAnterior.filter(r => r.status === 'concluida');
    
    // Interações em atraso (abertas há mais de SLA_DIAS)
    const emAtraso = dadosFinais.filter(r => {
      if (r.status === 'concluida') return false;
      const dias = differenceInDays(hoje, new Date(r.created_at));
      return dias > SLA_DIAS;
    });
    
    const emAtrasoAnterior = relacionamentosPeriodoAnterior.filter(r => {
      if (r.status === 'concluida') return false;
      const dias = differenceInDays(hoje, new Date(r.created_at));
      return dias > SLA_DIAS;
    });
    
    // Médicos em risco relacional (reclamação + reincidência + atraso)
    const medicosEmRisco = new Set<string>();
    const idsReincidentes = new Set(medicosReincidentes.map(m => m.id));
    
    dadosFinais.forEach(r => {
      if (!r.medico_vinculado_id) return;
      
      const temReclamacaoAberta = (r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')) && r.status !== 'concluida';
      const ehReincidente = idsReincidentes.has(r.medico_vinculado_id);
      const estaAtrasado = r.status !== 'concluida' && differenceInDays(hoje, new Date(r.created_at)) > SLA_DIAS;
      
      if ((temReclamacaoAberta && ehReincidente) || (temReclamacaoAberta && estaAtrasado) || (ehReincidente && estaAtrasado)) {
        medicosEmRisco.add(r.medico_vinculado_id);
      }
    });

    return {
      totalInteracoes: { 
        valor: total, 
        anterior: totalAnterior,
        variacao: totalAnterior > 0 ? ((total - totalAnterior) / totalAnterior) * 100 : 0
      },
      reclamacoesAbertas: { 
        valor: reclamacoesAbertas.length, 
        anterior: reclamacoesAbertasAnterior.length,
        variacao: reclamacoesAbertasAnterior.length > 0 ? ((reclamacoesAbertas.length - reclamacoesAbertasAnterior.length) / reclamacoesAbertasAnterior.length) * 100 : 0
      },
      acoesEmAndamento: { 
        valor: acoesEmAndamento.length, 
        anterior: 0,
        variacao: 0
      },
      concluidas: { 
        valor: concluidas.length, 
        anterior: concluidasAnterior.length,
        variacao: concluidasAnterior.length > 0 ? ((concluidas.length - concluidasAnterior.length) / concluidasAnterior.length) * 100 : 0
      },
      emAtraso: { 
        valor: emAtraso.length, 
        anterior: emAtrasoAnterior.length,
        variacao: emAtrasoAnterior.length > 0 ? ((emAtraso.length - emAtrasoAnterior.length) / emAtrasoAnterior.length) * 100 : 0
      },
      medicosReincidentes: { 
        valor: medicosReincidentes.length, 
        anterior: 0,
        variacao: 0
      },
      medicosEmRisco: { 
        valor: medicosEmRisco.size, 
        anterior: 0,
        variacao: 0
      },
    };
  }, [dadosFinais, relacionamentosPeriodoAnterior, medicosReincidentes]);

  // Interações por tipo (agrupado por natureza)
  const tipoData = useMemo(() => {
    const categorias: Record<string, { quantidade: number; items: any[] }> = {
      'Reclamação': { quantidade: 0, items: [] },
      'Feedback Positivo': { quantidade: 0, items: [] },
      'Ação Comemorativa': { quantidade: 0, items: [] },
      'Solicitação': { quantidade: 0, items: [] },
      'Outro': { quantidade: 0, items: [] }
    };
    
    dadosFinais.forEach(r => {
      const tipo = r.tipo || r.tipo_principal || 'Outro';
      let categoria = 'Outro';
      
      if (tipo.toLowerCase().includes('reclamação') || r.tipo_principal === 'Reclamação') {
        categoria = 'Reclamação';
      } else if (tipo.toLowerCase().includes('feedback') || tipo.toLowerCase().includes('positivo')) {
        categoria = 'Feedback Positivo';
      } else if (tipo.toLowerCase().includes('comemorativ') || tipo.toLowerCase().includes('aniversário')) {
        categoria = 'Ação Comemorativa';
      } else if (tipo.toLowerCase().includes('solicitação') || tipo.toLowerCase().includes('pedido')) {
        categoria = 'Solicitação';
      }
      
      categorias[categoria].quantidade++;
      categorias[categoria].items.push(r);
    });
    
    const total = dadosFinais.length;
    return Object.entries(categorias)
      .filter(([_, data]) => data.quantidade > 0)
      .map(([tipo, data]) => ({
        tipo,
        quantidade: data.quantidade,
        percentual: total > 0 ? ((data.quantidade / total) * 100).toFixed(1) : '0'
      }));
  }, [dadosFinais]);

  // Funil de atendimento
  const funilData = useMemo(() => {
    const etapas = [
      { id: 'aberta', label: 'Aberta', cor: 'hsl(var(--primary))' },
      { id: 'em_analise', label: 'Em Análise', cor: 'hsl(var(--chart-2))' },
      { id: 'aguardando_medico', label: 'Aguardando Médico', cor: 'hsl(var(--chart-3))' },
      { id: 'aguardando_interno', label: 'Aguardando Interno', cor: 'hsl(var(--chart-4))' },
      { id: 'concluida', label: 'Concluída', cor: 'hsl(142, 76%, 36%)' }
    ];
    
    const hoje = new Date();
    const result: Array<{ id: string; label: string; cor: string; valor: number; tempoMedio: number; conversao: string }> = etapas.map(etapa => {
      const items = dadosFinais.filter(r => r.status === etapa.id || 
        (etapa.id === 'em_analise' && r.status === 'em_progresso'));
      
      // Tempo médio na etapa (aproximado pelo tempo desde criação)
      const tempos = items.map(r => differenceInDays(hoje, new Date(r.created_at)));
      const tempoMedio = tempos.length > 0 ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
      
      return {
        ...etapa,
        valor: items.length,
        tempoMedio,
        conversao: '100'
      };
    });
    
    // Calcular conversão entre etapas
    for (let i = 1; i < result.length; i++) {
      const anterior = result[i - 1].valor;
      const atual = result[i].valor;
      result[i].conversao = anterior > 0 ? ((atual / anterior) * 100).toFixed(0) : '0';
    }
    
    return result;
  }, [dadosFinais]);

  // Status com SLA
  const statusSlaData = useMemo(() => {
    const hoje = new Date();
    
    const concluidasNoPrazo = dadosFinais.filter(r => {
      if (r.status !== 'concluida') return false;
      const diasAteResolver = differenceInDays(new Date(r.updated_at || r.created_at), new Date(r.created_at));
      return diasAteResolver <= SLA_DIAS;
    }).length;
    
    const concluidasForaPrazo = dadosFinais.filter(r => {
      if (r.status !== 'concluida') return false;
      const diasAteResolver = differenceInDays(new Date(r.updated_at || r.created_at), new Date(r.created_at));
      return diasAteResolver > SLA_DIAS;
    }).length;
    
    const abertasNoPrazo = dadosFinais.filter(r => {
      if (r.status === 'concluida') return false;
      const dias = differenceInDays(hoje, new Date(r.created_at));
      return dias <= SLA_DIAS;
    }).length;
    
    const abertasEmAtraso = dadosFinais.filter(r => {
      if (r.status === 'concluida') return false;
      const dias = differenceInDays(hoje, new Date(r.created_at));
      return dias > SLA_DIAS;
    }).length;
    
    return [
      { status: 'Concluídas no Prazo', valor: concluidasNoPrazo, cor: 'hsl(142, 76%, 36%)' },
      { status: 'Concluídas Fora do Prazo', valor: concluidasForaPrazo, cor: 'hsl(45, 93%, 47%)' },
      { status: 'Abertas no Prazo', valor: abertasNoPrazo, cor: 'hsl(217, 91%, 60%)' },
      { status: 'Abertas em Atraso', valor: abertasEmAtraso, cor: 'hsl(0, 84%, 60%)' }
    ];
  }, [dadosFinais]);

  // Evolução mensal
  const evolucaoMensal = useMemo(() => {
    const meses: Record<string, { 
      total: number; 
      reclamacoes: number; 
      atraso: number; 
      reincidentes: number;
      mes: string;
    }> = {};
    
    const idsReincidentes = new Set(medicosReincidentes.map(m => m.id));
    const hoje = new Date();
    
    // Últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const mesData = subMonths(hoje, i);
      const mesKey = format(mesData, 'yyyy-MM');
      const mesLabel = format(mesData, 'MMM/yy', { locale: ptBR });
      meses[mesKey] = { total: 0, reclamacoes: 0, atraso: 0, reincidentes: 0, mes: mesLabel };
    }
    
    relacionamentos.forEach(r => {
      const mesKey = format(new Date(r.created_at), 'yyyy-MM');
      if (!meses[mesKey]) return;
      
      meses[mesKey].total++;
      
      if (r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')) {
        meses[mesKey].reclamacoes++;
      }
      
      if (r.status !== 'concluida') {
        const dias = differenceInDays(hoje, new Date(r.created_at));
        if (dias > SLA_DIAS) {
          meses[mesKey].atraso++;
        }
      }
      
      if (r.medico_vinculado_id && idsReincidentes.has(r.medico_vinculado_id)) {
        meses[mesKey].reincidentes++;
      }
    });
    
    const result = Object.values(meses);
    
    // Projeção simples (média dos últimos 3 meses)
    if (result.length >= 3) {
      const ultimos3 = result.slice(-3);
      const mediaTotal = Math.round(ultimos3.reduce((a, b) => a + b.total, 0) / 3);
      const mediaReclamacoes = Math.round(ultimos3.reduce((a, b) => a + b.reclamacoes, 0) / 3);
      
      const proximoMes = addMonths(hoje, 1);
      result.push({
        mes: format(proximoMes, 'MMM/yy', { locale: ptBR }),
        total: mediaTotal,
        reclamacoes: mediaReclamacoes,
        atraso: 0,
        reincidentes: 0
      });
    }
    
    return result;
  }, [relacionamentos, medicosReincidentes]);

  // Alertas inteligentes
  const alertas = useMemo(() => {
    const resultado: Array<{
      tipo: 'critical' | 'warning' | 'info' | 'success';
      titulo: string;
      descricao: string;
      acao?: string;
    }> = [];
    
    const hoje = new Date();
    
    // Médicos com muitas reclamações abertas
    const reclamacoesPorMedico: Record<string, { nome: string; count: number }> = {};
    dadosFinais.forEach(r => {
      if (!r.medico_vinculado_id) return;
      if (r.tipo_principal !== 'Reclamação' && !r.tipo?.toLowerCase().includes('reclamação')) return;
      if (r.status === 'concluida') return;
      
      if (!reclamacoesPorMedico[r.medico_vinculado_id]) {
        reclamacoesPorMedico[r.medico_vinculado_id] = {
          nome: r.medicos?.nome_completo || 'Desconhecido',
          count: 0
        };
      }
      reclamacoesPorMedico[r.medico_vinculado_id].count++;
    });
    
    Object.entries(reclamacoesPorMedico)
      .filter(([_, data]) => data.count >= 2)
      .forEach(([_, data]) => {
        resultado.push({
          tipo: 'critical',
          titulo: `${data.nome} com ${data.count} reclamações abertas`,
          descricao: 'Médico requer atenção imediata do time de relacionamento',
          acao: 'Ver detalhes'
        });
      });
    
    // Reclamações muito antigas
    dadosFinais.forEach(r => {
      if (r.status === 'concluida') return;
      const dias = differenceInDays(hoje, new Date(r.created_at));
      if (dias > 15) {
        resultado.push({
          tipo: 'critical',
          titulo: `Interação aberta há ${dias} dias`,
          descricao: `${r.tipo || r.tipo_principal} - ${r.medicos?.nome_completo || 'Sem médico'}`,
          acao: 'Resolver'
        });
      }
    });
    
    // Médicos na blacklist com interações
    const medicosComInteracao = new Set(dadosFinais.map(r => r.medico_vinculado_id).filter(Boolean));
    // Verificar se algum médico está na blacklist (por nome ou outras formas)
    if (blacklist.length > 0 && medicosComInteracao.size > 0) {
      resultado.push({
        tipo: 'warning',
        titulo: `${blacklist.length} médicos na blacklist`,
        descricao: 'Verifique se há interações pendentes com médicos bloqueados',
        acao: 'Ver blacklist'
      });
    }
    
    // Aumento de reclamações
    const reclamacoesAtuais = dadosFinais.filter(r => 
      r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')
    ).length;
    const reclamacoesAnteriores = relacionamentosPeriodoAnterior.filter(r => 
      r.tipo_principal === 'Reclamação' || r.tipo?.toLowerCase().includes('reclamação')
    ).length;
    
    if (reclamacoesAnteriores > 0 && reclamacoesAtuais > reclamacoesAnteriores * 1.5) {
      resultado.push({
        tipo: 'warning',
        titulo: 'Aumento significativo de reclamações',
        descricao: `${Math.round(((reclamacoesAtuais - reclamacoesAnteriores) / reclamacoesAnteriores) * 100)}% mais reclamações que o período anterior`,
        acao: 'Analisar causas'
      });
    }
    
    // Reclamações por categoria (escala, pagamento, contrato)
    const reclamacoesPorCategoria: Record<string, number> = {};
    dadosFinais.forEach(r => {
      const desc = (r.descricao || '').toLowerCase();
      if (desc.includes('escala') || desc.includes('plantão')) {
        reclamacoesPorCategoria['escala'] = (reclamacoesPorCategoria['escala'] || 0) + 1;
      }
      if (desc.includes('pagamento') || desc.includes('salário') || desc.includes('honorário')) {
        reclamacoesPorCategoria['pagamento'] = (reclamacoesPorCategoria['pagamento'] || 0) + 1;
      }
      if (desc.includes('contrato')) {
        reclamacoesPorCategoria['contrato'] = (reclamacoesPorCategoria['contrato'] || 0) + 1;
      }
    });
    
    Object.entries(reclamacoesPorCategoria)
      .filter(([_, count]) => count >= 3)
      .forEach(([categoria, count]) => {
        resultado.push({
          tipo: 'warning',
          titulo: `${count} reclamações relacionadas a ${categoria}`,
          descricao: 'Padrão identificado pode indicar problema sistêmico',
          acao: 'Investigar'
        });
      });
    
    // Boas notícias
    if (kpis.concluidas.valor > 0 && kpis.emAtraso.valor === 0) {
      resultado.push({
        tipo: 'success',
        titulo: 'Todas as interações dentro do SLA!',
        descricao: `${kpis.concluidas.valor} interações concluídas no prazo`,
      });
    }
    
    if (reclamacoesAtuais < reclamacoesAnteriores * 0.7 && reclamacoesAnteriores > 0) {
      resultado.push({
        tipo: 'success',
        titulo: 'Redução significativa de reclamações',
        descricao: `${Math.round(((reclamacoesAnteriores - reclamacoesAtuais) / reclamacoesAnteriores) * 100)}% menos reclamações que o período anterior`,
      });
    }
    
    // Ordenar por criticidade
    const ordem = { critical: 0, warning: 1, info: 2, success: 3 };
    resultado.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
    
    return resultado.slice(0, 8); // Limitar a 8 alertas
  }, [dadosFinais, relacionamentosPeriodoAnterior, blacklist, kpis]);

  // Lista de tipos únicos para filtro
  const tiposUnicos = useMemo(() => {
    const tipos = new Set<string>();
    relacionamentos.forEach(r => {
      if (r.tipo) tipos.add(r.tipo);
      if (r.tipo_principal) tipos.add(r.tipo_principal);
    });
    return Array.from(tipos).sort();
  }, [relacionamentos]);

  // Lista de médicos para filtro
  const medicosUnicos = useMemo(() => {
    const medicos: Record<string, string> = {};
    relacionamentos.forEach(r => {
      if (r.medico_vinculado_id && r.medicos?.nome_completo) {
        medicos[r.medico_vinculado_id] = r.medicos.nome_completo;
      }
    });
    return Object.entries(medicos).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [relacionamentos]);

  return {
    // Estados
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    filters,
    setFilters,
    isLoading,
    
    // Dados
    dadosFiltrados: dadosFinais,
    kpis,
    tipoData,
    funilData,
    statusSlaData,
    evolucaoMensal,
    alertas,
    medicosReincidentes,
    
    // Para filtros
    tiposUnicos,
    medicosUnicos,
    
    // Constantes
    SLA_DIAS,
  };
}
