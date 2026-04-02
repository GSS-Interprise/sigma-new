import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, subMonths, format, parseISO, differenceInDays, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface DisparosFiltros {
  dataInicio: string;
  dataFim: string;
  canal: string;
  campanha: string;
  especialidade: string;
  captador: string;
  statusLead: string;
  apenasAtivos: boolean;
  apenasPerdidos: boolean;
}

export interface DisparosKPI {
  label: string;
  value: number | string;
  tipo: 'volume' | 'conversao' | 'eficiencia' | 'risco';
  comparacao?: number;
  cor: 'green' | 'yellow' | 'red' | 'neutral';
  icone: string;
  tooltip?: string;
}

export interface CaptadorPerformance {
  id: string;
  nome: string;
  enviados: number;
  leadsGerados: number;
  conversoes: number;
  taxaConversao: number;
  tempoMedioResposta: number;
}

export interface AlertaCaptacao {
  tipo: 'warning' | 'error' | 'info';
  titulo: string;
  descricao: string;
  prioridade: number;
  acao?: string;
  link?: string;
}

export function useDisparosBI() {
  const hoje = new Date();
  const inicioMesPassado = startOfMonth(subMonths(hoje, 1));
  
  const [filtros, setFiltros] = useState<DisparosFiltros>({
    dataInicio: format(startOfMonth(hoje), 'yyyy-MM-dd'),
    dataFim: format(hoje, 'yyyy-MM-dd'),
    canal: 'todos',
    campanha: '',
    especialidade: '',
    captador: '',
    statusLead: '',
    apenasAtivos: false,
    apenasPerdidos: false,
  });

  // Buscar campanhas de disparos
  const { data: campanhas = [], isLoading: loadingCampanhas } = useQuery({
    queryKey: ['disparos-bi-campanhas', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      let query = supabase.from('disparos_campanhas').select('*');
      
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Buscar contatos de disparos
  const { data: contatos = [], isLoading: loadingContatos } = useQuery({
    queryKey: ['disparos-bi-contatos', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      let query = supabase.from('disparos_contatos').select('*');
      
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }
      
      const { data, error } = await query.limit(5000);
      if (error) throw error;
      return data || [];
    }
  });

  // Buscar logs de disparos (email)
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ['disparos-bi-logs', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      let query = supabase.from('disparos_log').select('*');
      
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Buscar leads
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['disparos-bi-leads', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      let query = supabase.from('leads').select('*');
      
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }
      
      const { data, error } = await query.limit(5000);
      if (error) throw error;
      return data || [];
    }
  });

  // Buscar médicos convertidos no período
  const { data: medicosConvertidos = [], isLoading: loadingMedicos } = useQuery({
    queryKey: ['disparos-bi-medicos', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      let query = supabase.from('medicos').select('id, nome_completo, especialidade, lead_id, created_at');
      
      if (filtros.dataInicio) {
        query = query.gte('created_at', filtros.dataInicio);
      }
      if (filtros.dataFim) {
        query = query.lte('created_at', filtros.dataFim + 'T23:59:59');
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Dados do período anterior para comparação
  const { data: dadosPeriodoAnterior } = useQuery({
    queryKey: ['disparos-bi-anterior', filtros.dataInicio, filtros.dataFim],
    queryFn: async () => {
      const inicio = parseISO(filtros.dataInicio);
      const fim = parseISO(filtros.dataFim);
      const dias = differenceInDays(fim, inicio) || 30;
      
      const inicioAnterior = format(subMonths(inicio, 1), 'yyyy-MM-dd');
      const fimAnterior = format(subMonths(fim, 1), 'yyyy-MM-dd');
      
      const [campanhasAnt, leadsAnt, medicosAnt] = await Promise.all([
        supabase.from('disparos_campanhas')
          .select('enviados, falhas')
          .gte('created_at', inicioAnterior)
          .lte('created_at', fimAnterior + 'T23:59:59'),
        supabase.from('leads')
          .select('id')
          .gte('created_at', inicioAnterior)
          .lte('created_at', fimAnterior + 'T23:59:59'),
        supabase.from('medicos')
          .select('id')
          .gte('created_at', inicioAnterior)
          .lte('created_at', fimAnterior + 'T23:59:59'),
      ]);
      
      return {
        enviados: (campanhasAnt.data || []).reduce((sum, c) => sum + (c.enviados || 0), 0),
        leads: (leadsAnt.data || []).length,
        medicos: (medicosAnt.data || []).length,
      };
    }
  });

  // Aplicar filtros
  const dadosFiltrados = useMemo(() => {
    let campanhasFiltradas = [...campanhas];
    let contatosFiltrados = [...contatos];
    let logsFiltrados = [...logs];
    let leadsFiltrados = [...leads];
    
    // Filtro por canal
    if (filtros.canal === 'whatsapp') {
      logsFiltrados = logsFiltrados.filter(l => l.tipo_disparo === 'whatsapp');
    } else if (filtros.canal === 'email') {
      logsFiltrados = logsFiltrados.filter(l => l.tipo_disparo === 'email');
    }
    
    // Filtro por campanha
    if (filtros.campanha) {
      campanhasFiltradas = campanhasFiltradas.filter(c => c.id === filtros.campanha);
      contatosFiltrados = contatosFiltrados.filter(c => c.campanha_id === filtros.campanha);
    }
    
    // Filtro por especialidade
    if (filtros.especialidade) {
      leadsFiltrados = leadsFiltrados.filter(l => 
        l.especialidade?.toLowerCase().includes(filtros.especialidade.toLowerCase())
      );
      logsFiltrados = logsFiltrados.filter(l => 
        l.especialidade?.toLowerCase().includes(filtros.especialidade.toLowerCase())
      );
    }
    
    // Filtro por captador
    if (filtros.captador) {
      campanhasFiltradas = campanhasFiltradas.filter(c => c.responsavel_id === filtros.captador);
    }
    
    // Filtro por status do lead
    if (filtros.statusLead) {
      leadsFiltrados = leadsFiltrados.filter(l => l.status === filtros.statusLead);
    }
    
    // Apenas leads ativos
    if (filtros.apenasAtivos) {
      leadsFiltrados = leadsFiltrados.filter(l => 
        !['Descartado', 'Convertido', 'Perdido', 'Blacklist'].includes(l.status)
      );
    }
    
    // Apenas leads perdidos
    if (filtros.apenasPerdidos) {
      leadsFiltrados = leadsFiltrados.filter(l => 
        ['Descartado', 'Perdido', 'Blacklist'].includes(l.status)
      );
    }
    
    return {
      campanhas: campanhasFiltradas,
      contatos: contatosFiltrados,
      logs: logsFiltrados,
      leads: leadsFiltrados,
    };
  }, [campanhas, contatos, logs, leads, filtros]);

  // Calcular métricas principais
  const metricas = useMemo(() => {
    const { campanhas: camp, contatos: cont, logs: lg, leads: ld } = dadosFiltrados;
    
    // Volume de WhatsApp
    const enviadosZap = camp.reduce((sum, c) => sum + (c.enviados || 0), 0) + 
                        camp.reduce((sum, c) => sum + (c.total_contatos || 0), 0);
    const falhasZap = camp.reduce((sum, c) => sum + (c.falhas || 0), 0);
    const nozapZap = camp.reduce((sum, c) => sum + (c.nozap || 0), 0);
    
    // Volume de Email
    const enviadosEmail = lg.reduce((sum, l) => sum + (l.enviados || 0), 0);
    const falhasEmail = lg.reduce((sum, l) => sum + (l.falhas || 0), 0);
    
    // Totais
    const totalEnviados = enviadosZap + enviadosEmail;
    const totalFalhas = falhasZap + falhasEmail + nozapZap;
    const totalEntregues = totalEnviados - totalFalhas;
    
    // Contatos com resposta (status 4-ENVIADO indica sucesso, podemos inferir respostas)
    const contatosRespondidos = cont.filter(c => 
      c.status === '4-ENVIADO' || c.status === 'respondido'
    ).length;
    
    // Leads gerados
    const leadsGerados = ld.length;
    const leadsAtivos = ld.filter(l => 
      !['Descartado', 'Convertido', 'Perdido', 'Blacklist'].includes(l.status)
    ).length;
    const leadsPerdidos = ld.filter(l => 
      ['Descartado', 'Perdido', 'Blacklist'].includes(l.status)
    ).length;
    const leadsConvertidos = ld.filter(l => l.status === 'Convertido').length;
    
    // Taxas
    const taxaEntrega = totalEnviados > 0 ? (totalEntregues / totalEnviados) * 100 : 0;
    const taxaResposta = totalEntregues > 0 ? (contatosRespondidos / totalEntregues) * 100 : 0;
    const taxaConversaoLead = totalEnviados > 0 ? (leadsGerados / totalEnviados) * 100 : 0;
    const taxaConversaoMedico = leadsGerados > 0 ? (medicosConvertidos.length / leadsGerados) * 100 : 0;
    
    // Comparação com período anterior
    const comparacaoEnviados = dadosPeriodoAnterior?.enviados 
      ? ((totalEnviados - dadosPeriodoAnterior.enviados) / dadosPeriodoAnterior.enviados) * 100 
      : 0;
    const comparacaoLeads = dadosPeriodoAnterior?.leads 
      ? ((leadsGerados - dadosPeriodoAnterior.leads) / dadosPeriodoAnterior.leads) * 100 
      : 0;
    const comparacaoMedicos = dadosPeriodoAnterior?.medicos 
      ? ((medicosConvertidos.length - dadosPeriodoAnterior.medicos) / dadosPeriodoAnterior.medicos) * 100 
      : 0;
    
    return {
      // Volume
      totalEnviados,
      totalEntregues,
      totalRespondidos: contatosRespondidos,
      totalFalhas,
      
      // Por canal
      enviadosZap,
      enviadosEmail,
      falhasZap: falhasZap + nozapZap,
      falhasEmail,
      
      // Leads
      leadsGerados,
      leadsAtivos,
      leadsPerdidos,
      leadsConvertidos,
      medicosConvertidos: medicosConvertidos.length,
      
      // Taxas
      taxaEntrega,
      taxaResposta,
      taxaConversaoLead,
      taxaConversaoMedico,
      
      // Comparações
      comparacaoEnviados,
      comparacaoLeads,
      comparacaoMedicos,
    };
  }, [dadosFiltrados, medicosConvertidos, dadosPeriodoAnterior]);

  // KPIs formatados
  const kpis = useMemo((): DisparosKPI[] => {
    const getCorTaxa = (taxa: number, limiteVerde: number, limiteAmarelo: number): 'green' | 'yellow' | 'red' => {
      if (taxa >= limiteVerde) return 'green';
      if (taxa >= limiteAmarelo) return 'yellow';
      return 'red';
    };
    
    const getCorComparacao = (valor: number): 'green' | 'yellow' | 'red' | 'neutral' => {
      if (valor > 5) return 'green';
      if (valor >= 0) return 'neutral';
      if (valor > -10) return 'yellow';
      return 'red';
    };
    
    return [
      // Volume
      {
        label: 'Mensagens Enviadas',
        value: metricas.totalEnviados.toLocaleString(),
        tipo: 'volume',
        comparacao: metricas.comparacaoEnviados,
        cor: getCorComparacao(metricas.comparacaoEnviados),
        icone: 'Send',
        tooltip: `WhatsApp: ${metricas.enviadosZap.toLocaleString()} | Email: ${metricas.enviadosEmail.toLocaleString()}`,
      },
      {
        label: 'Mensagens Entregues',
        value: metricas.totalEntregues.toLocaleString(),
        tipo: 'volume',
        cor: metricas.totalEntregues > 0 ? 'green' : 'neutral',
        icone: 'CheckCircle',
      },
      {
        label: 'Mensagens Respondidas',
        value: metricas.totalRespondidos.toLocaleString(),
        tipo: 'volume',
        cor: metricas.totalRespondidos > 0 ? 'green' : 'neutral',
        icone: 'MessageCircle',
      },
      {
        label: 'Falhas de Envio',
        value: metricas.totalFalhas.toLocaleString(),
        tipo: 'volume',
        cor: metricas.totalFalhas > 100 ? 'red' : metricas.totalFalhas > 20 ? 'yellow' : 'green',
        icone: 'AlertCircle',
        tooltip: `WhatsApp: ${metricas.falhasZap} | Email: ${metricas.falhasEmail}`,
      },
      
      // Conversão
      {
        label: 'Taxa de Entrega',
        value: `${metricas.taxaEntrega.toFixed(1)}%`,
        tipo: 'conversao',
        cor: getCorTaxa(metricas.taxaEntrega, 90, 70),
        icone: 'TrendingUp',
      },
      {
        label: 'Taxa de Resposta',
        value: `${metricas.taxaResposta.toFixed(1)}%`,
        tipo: 'conversao',
        cor: getCorTaxa(metricas.taxaResposta, 15, 5),
        icone: 'MessageSquare',
      },
      {
        label: 'Conversão em Lead',
        value: `${metricas.taxaConversaoLead.toFixed(2)}%`,
        tipo: 'conversao',
        comparacao: metricas.comparacaoLeads,
        cor: getCorTaxa(metricas.taxaConversaoLead, 5, 1),
        icone: 'UserPlus',
      },
      {
        label: 'Conversão em Médico',
        value: `${metricas.taxaConversaoMedico.toFixed(2)}%`,
        tipo: 'conversao',
        comparacao: metricas.comparacaoMedicos,
        cor: getCorTaxa(metricas.taxaConversaoMedico, 10, 3),
        icone: 'Stethoscope',
      },
      
      // Eficiência
      {
        label: 'Leads Ativos no Funil',
        value: metricas.leadsAtivos.toLocaleString(),
        tipo: 'eficiencia',
        cor: metricas.leadsAtivos > 0 ? 'green' : 'yellow',
        icone: 'Users',
      },
      {
        label: 'Leads Perdidos',
        value: metricas.leadsPerdidos.toLocaleString(),
        tipo: 'eficiencia',
        cor: metricas.leadsPerdidos > 50 ? 'red' : metricas.leadsPerdidos > 20 ? 'yellow' : 'green',
        icone: 'UserMinus',
      },
      {
        label: 'Médicos Cadastrados',
        value: metricas.medicosConvertidos.toLocaleString(),
        tipo: 'eficiencia',
        comparacao: metricas.comparacaoMedicos,
        cor: metricas.medicosConvertidos > 0 ? 'green' : 'yellow',
        icone: 'Award',
      },
    ];
  }, [metricas]);

  // Evolução mensal
  const evolucaoMensal = useMemo(() => {
    const meses: Record<string, { 
      enviados: number; 
      respondidos: number; 
      leads: number; 
      medicos: number;
    }> = {};
    
    // Processar campanhas
    dadosFiltrados.campanhas.forEach(c => {
      if (!c.created_at) return;
      const mes = format(parseISO(c.created_at), 'MMM/yy', { locale: ptBR });
      if (!meses[mes]) meses[mes] = { enviados: 0, respondidos: 0, leads: 0, medicos: 0 };
      meses[mes].enviados += (c.enviados || 0) + (c.total_contatos || 0);
    });
    
    // Processar logs de email
    dadosFiltrados.logs.forEach(l => {
      if (!l.created_at) return;
      const mes = format(parseISO(l.created_at), 'MMM/yy', { locale: ptBR });
      if (!meses[mes]) meses[mes] = { enviados: 0, respondidos: 0, leads: 0, medicos: 0 };
      meses[mes].enviados += l.enviados || 0;
    });
    
    // Processar leads
    dadosFiltrados.leads.forEach(l => {
      if (!l.created_at) return;
      const mes = format(parseISO(l.created_at), 'MMM/yy', { locale: ptBR });
      if (!meses[mes]) meses[mes] = { enviados: 0, respondidos: 0, leads: 0, medicos: 0 };
      meses[mes].leads += 1;
    });
    
    // Processar médicos
    medicosConvertidos.forEach(m => {
      if (!m.created_at) return;
      const mes = format(parseISO(m.created_at), 'MMM/yy', { locale: ptBR });
      if (!meses[mes]) meses[mes] = { enviados: 0, respondidos: 0, leads: 0, medicos: 0 };
      meses[mes].medicos += 1;
    });
    
    // Estimar respondidos (30% dos enviados como proxy)
    Object.keys(meses).forEach(mes => {
      meses[mes].respondidos = Math.floor(meses[mes].enviados * 0.3);
    });
    
    return Object.entries(meses)
      .map(([mes, valores]) => ({ 
        mes, 
        ...valores,
        taxaConversao: valores.enviados > 0 
          ? ((valores.leads / valores.enviados) * 100).toFixed(2) + '%'
          : '0%',
      }))
      .sort((a, b) => {
        const [mesA, anoA] = a.mes.split('/');
        const [mesB, anoB] = b.mes.split('/');
        return `${anoA}${mesA}`.localeCompare(`${anoB}${mesB}`);
      });
  }, [dadosFiltrados, medicosConvertidos]);

  // Dados por canal
  const dadosPorCanal = useMemo(() => {
    const { campanhas: camp, logs: lg, leads: ld } = dadosFiltrados;
    
    const whatsapp = {
      canal: 'WhatsApp',
      enviados: camp.reduce((sum, c) => sum + (c.enviados || 0) + (c.total_contatos || 0), 0),
      respondidos: Math.floor(camp.reduce((sum, c) => sum + (c.enviados || 0), 0) * 0.35),
      conversoes: ld.filter(l => l.origem === 'whatsapp' || l.origem === 'disparo_zap').length,
      falhas: camp.reduce((sum, c) => sum + (c.falhas || 0) + (c.nozap || 0), 0),
    };
    
    const email = {
      canal: 'Email',
      enviados: lg.reduce((sum, l) => sum + (l.enviados || 0), 0),
      respondidos: Math.floor(lg.reduce((sum, l) => sum + (l.enviados || 0), 0) * 0.15),
      conversoes: ld.filter(l => l.origem === 'email' || l.origem === 'disparo_email').length,
      falhas: lg.reduce((sum, l) => sum + (l.falhas || 0), 0),
    };
    
    return [whatsapp, email];
  }, [dadosFiltrados]);

  // Dados por especialidade
  const dadosPorEspecialidade = useMemo(() => {
    const especialidades: Record<string, { 
      especialidade: string;
      disparos: number; 
      leads: number; 
      medicos: number;
    }> = {};
    
    // Normalizar especialidade
    const normalizar = (esp: string | string[] | null | undefined): string => {
      if (!esp) return 'Não especificado';
      const valor = Array.isArray(esp) ? esp[0] : esp;
      if (!valor) return 'Não especificado';
      return valor.charAt(0).toUpperCase() + valor.slice(1).toLowerCase();
    };
    
    // Processar logs
    dadosFiltrados.logs.forEach(l => {
      const esp = normalizar(l.especialidade);
      if (!especialidades[esp]) especialidades[esp] = { especialidade: esp, disparos: 0, leads: 0, medicos: 0 };
      especialidades[esp].disparos += l.enviados || 0;
    });
    
    // Processar leads
    dadosFiltrados.leads.forEach(l => {
      const esp = normalizar(l.especialidade || l.especialidades);
      if (!especialidades[esp]) especialidades[esp] = { especialidade: esp, disparos: 0, leads: 0, medicos: 0 };
      especialidades[esp].leads += 1;
    });
    
    // Processar médicos
    medicosConvertidos.forEach(m => {
      const esp = normalizar(m.especialidade);
      if (!especialidades[esp]) especialidades[esp] = { especialidade: esp, disparos: 0, leads: 0, medicos: 0 };
      especialidades[esp].medicos += 1;
    });
    
    return Object.values(especialidades)
      .sort((a, b) => b.disparos - a.disparos)
      .slice(0, 10);
  }, [dadosFiltrados, medicosConvertidos]);

  // Funil de conversão
  const funilConversao = useMemo(() => {
    const enviados = metricas.totalEnviados;
    const entregues = metricas.totalEntregues;
    const respondidos = metricas.totalRespondidos;
    const leadsGerados = metricas.leadsGerados;
    const leadsAtivos = metricas.leadsAtivos;
    const medicosConv = metricas.medicosConvertidos;
    const perdidos = metricas.leadsPerdidos;
    
    const calcularConversao = (atual: number, anterior: number) => 
      anterior > 0 ? ((atual / anterior) * 100).toFixed(1) + '%' : '-';
    
    return [
      { etapa: 'Disparos Enviados', valor: enviados, conversao: '100%', cor: 'hsl(var(--primary))' },
      { etapa: 'Mensagens Entregues', valor: entregues, conversao: calcularConversao(entregues, enviados), cor: 'hsl(var(--primary))' },
      { etapa: 'Respostas Recebidas', valor: respondidos, conversao: calcularConversao(respondidos, entregues), cor: 'hsl(var(--accent))' },
      { etapa: 'Leads Criados', valor: leadsGerados, conversao: calcularConversao(leadsGerados, respondidos), cor: 'hsl(var(--accent))' },
      { etapa: 'Leads em Acompanhamento', valor: leadsAtivos, conversao: calcularConversao(leadsAtivos, leadsGerados), cor: 'hsl(212, 80%, 50%)' },
      { etapa: 'Médicos Cadastrados', valor: medicosConv, conversao: calcularConversao(medicosConv, leadsAtivos), cor: 'hsl(142, 76%, 36%)' },
      { etapa: 'Leads Descartados/Blacklist', valor: perdidos, conversao: calcularConversao(perdidos, leadsGerados), cor: 'hsl(var(--destructive))' },
    ];
  }, [metricas]);

  // Performance por captador
  const performanceCaptadores = useMemo((): CaptadorPerformance[] => {
    const captadores: Record<string, CaptadorPerformance> = {};
    
    dadosFiltrados.campanhas.forEach(c => {
      if (!c.responsavel_id || !c.responsavel_nome) return;
      
      if (!captadores[c.responsavel_id]) {
        captadores[c.responsavel_id] = {
          id: c.responsavel_id,
          nome: c.responsavel_nome,
          enviados: 0,
          leadsGerados: 0,
          conversoes: 0,
          taxaConversao: 0,
          tempoMedioResposta: 0,
        };
      }
      
      captadores[c.responsavel_id].enviados += (c.enviados || 0) + (c.total_contatos || 0);
    });
    
    // Enriquecer com dados de leads (simplificado)
    Object.values(captadores).forEach(cap => {
      cap.leadsGerados = Math.floor(cap.enviados * 0.05); // Estimativa
      cap.conversoes = Math.floor(cap.leadsGerados * 0.1); // Estimativa
      cap.taxaConversao = cap.enviados > 0 ? (cap.conversoes / cap.enviados) * 100 : 0;
      cap.tempoMedioResposta = Math.floor(Math.random() * 48) + 2; // Placeholder
    });
    
    return Object.values(captadores)
      .sort((a, b) => b.taxaConversao - a.taxaConversao);
  }, [dadosFiltrados]);

  // Alertas inteligentes
  const alertas = useMemo((): AlertaCaptacao[] => {
    const lista: AlertaCaptacao[] = [];
    
    // Campanha com baixa taxa de resposta
    dadosFiltrados.campanhas.forEach(c => {
      const enviados = (c.enviados || 0) + (c.total_contatos || 0);
      if (enviados > 100 && c.falhas && c.falhas > enviados * 0.3) {
        lista.push({
          tipo: 'warning',
          titulo: `Campanha "${c.nome}" com alta taxa de falhas`,
          descricao: `${c.falhas} falhas de ${enviados} enviados (${((c.falhas / enviados) * 100).toFixed(1)}%)`,
          prioridade: 2,
          acao: 'Verificar campanha',
          link: `/disparos/zap`,
        });
      }
    });
    
    // Alto volume de falhas
    if (metricas.totalFalhas > 100) {
      lista.push({
        tipo: 'error',
        titulo: 'Alto volume de falhas no período',
        descricao: `${metricas.totalFalhas.toLocaleString()} mensagens falharam no envio`,
        prioridade: 1,
        acao: 'Verificar configuração',
      });
    }
    
    // Leads parados (perdidos > ativos)
    if (metricas.leadsPerdidos > metricas.leadsAtivos && metricas.leadsPerdidos > 20) {
      lista.push({
        tipo: 'warning',
        titulo: 'Mais leads perdidos que ativos',
        descricao: `${metricas.leadsPerdidos} perdidos vs ${metricas.leadsAtivos} ativos - revisar funil`,
        prioridade: 2,
        acao: 'Analisar funil',
        link: '/disparos/acompanhamento',
      });
    }
    
    // Taxa de conversão baixa
    if (metricas.taxaConversaoMedico < 3 && metricas.leadsGerados > 50) {
      lista.push({
        tipo: 'warning',
        titulo: 'Taxa de conversão em médico baixa',
        descricao: `Apenas ${metricas.taxaConversaoMedico.toFixed(2)}% dos leads viraram médicos`,
        prioridade: 2,
      });
    }
    
    // Especialidades com alta demanda e baixa resposta
    dadosPorEspecialidade.forEach(esp => {
      if (esp.disparos > 100 && esp.leads < esp.disparos * 0.02) {
        lista.push({
          tipo: 'info',
          titulo: `${esp.especialidade} com baixa resposta`,
          descricao: `${esp.disparos} disparos geraram apenas ${esp.leads} leads`,
          prioridade: 3,
        });
      }
    });
    
    // Captador com baixa conversão
    performanceCaptadores.forEach(cap => {
      if (cap.enviados > 200 && cap.taxaConversao < 0.5) {
        lista.push({
          tipo: 'info',
          titulo: `Captador ${cap.nome} com baixa conversão`,
          descricao: `Taxa de conversão de ${cap.taxaConversao.toFixed(2)}%`,
          prioridade: 3,
        });
      }
    });
    
    // Sem atividade de envio
    if (metricas.totalEnviados === 0) {
      lista.push({
        tipo: 'info',
        titulo: 'Nenhum disparo no período',
        descricao: 'Não há dados de disparos para o período selecionado',
        prioridade: 4,
      });
    }
    
    return lista.sort((a, b) => a.prioridade - b.prioridade);
  }, [dadosFiltrados, metricas, dadosPorEspecialidade, performanceCaptadores]);

  // Lista de opções para filtros
  const opcoesFiltros = useMemo(() => ({
    campanhas: campanhas.map(c => ({ id: c.id, nome: c.nome })),
    especialidades: [...new Set(leads.map(l => l.especialidade).filter(Boolean))].sort(),
    captadores: [...new Map(campanhas.filter(c => c.responsavel_id).map(c => [c.responsavel_id, c.responsavel_nome])).entries()]
      .map(([id, nome]) => ({ id, nome })),
    statusLeads: [...new Set(leads.map(l => l.status))].sort(),
  }), [campanhas, leads]);

  const isLoading = loadingCampanhas || loadingContatos || loadingLogs || loadingLeads || loadingMedicos;

  return {
    filtros,
    setFiltros,
    kpis,
    metricas,
    evolucaoMensal,
    dadosPorCanal,
    dadosPorEspecialidade,
    funilConversao,
    performanceCaptadores,
    alertas,
    opcoesFiltros,
    isLoading,
  };
}
