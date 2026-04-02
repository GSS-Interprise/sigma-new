import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Padrões para identificar furo de escala
const FURO_PATTERNS = [
  "sem profissional",
  "sem profissional alocado",
  "vago",
  "a definir",
  "disponível",
];

function isFuroDeEscala(profissionalNome: string | null): boolean {
  if (!profissionalNome) return true;
  const normalized = profissionalNome.toLowerCase().trim();
  return FURO_PATTERNS.some(p => normalized.includes(p)) || normalized === "";
}

function calcularHoras(horaInicio: string | null, horaFim: string | null): number {
  if (!horaInicio || !horaFim) return 0;
  const inicio = horaInicio.split(":").map(Number);
  const fim = horaFim.split(":").map(Number);
  if (inicio[0] === 0 && inicio[1] === 0 && fim[0] === 0 && fim[1] === 0) return 0;
  let horas = fim[0] - inicio[0] + (fim[1] - inicio[1]) / 60;
  if (horas < 0) horas += 24;
  return horas;
}

function getDiaSemana(dataStr: string): string {
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const date = new Date(dataStr + "T12:00:00");
  return dias[date.getDay()];
}

function getFaixaHorario(horaInicio: string | null): string {
  if (!horaInicio) return "Não informado";
  const hora = parseInt(horaInicio.split(":")[0]);
  if (hora >= 6 && hora < 12) return "Manhã";
  if (hora >= 12 && hora < 18) return "Tarde";
  return "Noite";
}

export interface EscalasBIFilters {
  mes: number;
  ano: number;
  localId: string;
  setorId: string;
  profissional: string;
}

export interface AlertaEscala {
  tipo: "risco" | "atencao" | "info";
  titulo: string;
  descricao: string;
  valor?: number;
}

export function useEscalasBI() {
  const currentDate = new Date();
  const [mes, setMes] = useState(currentDate.getMonth() + 1);
  const [ano, setAno] = useState(currentDate.getFullYear());
  const [localId, setLocalId] = useState<string>("__all__");
  const [setorId, setSetorId] = useState<string>("__all__");
  const [profissional, setProfissional] = useState<string>("");

  // Buscar locais disponíveis
  const { data: locais = [] } = useQuery({
    queryKey: ["escalas-bi-locais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("escalas_locais")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Buscar setores disponíveis (filtrados por local)
  const { data: setores = [] } = useQuery({
    queryKey: ["escalas-bi-setores", localId],
    queryFn: async () => {
      let query = supabase
        .from("escalas_setores")
        .select("id, nome, local_id")
        .eq("ativo", true)
        .order("nome");
      
      if (localId !== "__all__") {
        query = query.eq("local_id", localId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Buscar escalas do período
  const { data: escalas = [], isLoading } = useQuery({
    queryKey: ["escalas-bi-dados", mes, ano, localId, setorId, profissional],
    queryFn: async () => {
      const startDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const endDate = new Date(ano, mes, 0).toISOString().split("T")[0];

      // Resolver IDs externos se necessário
      let localIdExterno: string | undefined;
      let setorIdExterno: string | undefined;

      if (localId !== "__all__") {
        const { data: local } = await supabase
          .from("escalas_locais")
          .select("id_externo")
          .eq("id", localId)
          .maybeSingle();
        localIdExterno = local?.id_externo;
      }

      if (setorId !== "__all__") {
        const { data: setor } = await supabase
          .from("escalas_setores")
          .select("id_externo")
          .eq("id", setorId)
          .maybeSingle();
        setorIdExterno = setor?.id_externo;
      }

      let query = supabase
        .from("escalas_integradas")
        .select("*")
        .eq("sistema_origem", "DR_ESCALA")
        .gte("data_escala", startDate)
        .lte("data_escala", endDate)
        .order("data_escala")
        .limit(10000);

      if (localIdExterno) {
        query = query.eq("local_id_externo", localIdExterno);
      }
      if (setorIdExterno) {
        query = query.eq("setor_id_externo", setorIdExterno);
      }
      if (profissional) {
        query = query.ilike("profissional_nome", `%${profissional}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 0,
  });

  // Dados do mês anterior para comparação
  const { data: escalasMesAnterior = [] } = useQuery({
    queryKey: ["escalas-bi-mes-anterior", mes, ano],
    queryFn: async () => {
      const mesAnterior = mes === 1 ? 12 : mes - 1;
      const anoAnterior = mes === 1 ? ano - 1 : ano;
      const startDate = `${anoAnterior}-${String(mesAnterior).padStart(2, "0")}-01`;
      const endDate = new Date(anoAnterior, mesAnterior, 0).toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("escalas_integradas")
        .select("profissional_nome, hora_inicio, hora_fim, dados_incompletos")
        .eq("sistema_origem", "DR_ESCALA")
        .gte("data_escala", startDate)
        .lte("data_escala", endDate)
        .limit(10000);

      if (error) throw error;
      return data || [];
    },
  });

  // Métricas calculadas
  const metricas = useMemo(() => {
    const total = escalas.length;
    const furos = escalas.filter(e => isFuroDeEscala(e.profissional_nome));
    const plantoesProdutivos = escalas.filter(e => !isFuroDeEscala(e.profissional_nome));
    const incompletos = escalas.filter(e => e.dados_incompletos);
    const completos = escalas.filter(e => !e.dados_incompletos);

    // Horas (apenas plantões produtivos e completos)
    const horasEscaladas = plantoesProdutivos.reduce((acc, e) => {
      if (e.dados_incompletos) return acc;
      return acc + calcularHoras(e.hora_inicio, e.hora_fim);
    }, 0);

    // Horas descobertas (furos)
    const horasDescobertas = furos.reduce((acc, e) => {
      return acc + calcularHoras(e.hora_inicio, e.hora_fim);
    }, 0);

    // Profissionais únicos (excluindo furos)
    const profissionaisUnicos = new Set(
      plantoesProdutivos.map(e => e.profissional_nome)
    );

    // Dias únicos no período
    const diasUnicos = new Set(escalas.map(e => e.data_escala));
    const diasComFuro = new Set(furos.map(e => e.data_escala));

    // Média de horas por profissional
    const mediaHorasPorProfissional = profissionaisUnicos.size > 0 
      ? horasEscaladas / profissionaisUnicos.size 
      : 0;

    // Média de plantões por dia
    const mediaPlantoesporDia = diasUnicos.size > 0 
      ? total / diasUnicos.size 
      : 0;

    // % qualidade dos dados
    const percentualCompletos = total > 0 ? (completos.length / total) * 100 : 100;

    // % furos
    const percentualFuros = total > 0 ? (furos.length / total) * 100 : 0;

    // Variação vs mês anterior
    const totalAnterior = escalasMesAnterior.length;
    const furosAnterior = escalasMesAnterior.filter(e => isFuroDeEscala(e.profissional_nome)).length;
    const horasAnterior = escalasMesAnterior
      .filter(e => !isFuroDeEscala(e.profissional_nome) && !e.dados_incompletos)
      .reduce((acc, e) => acc + calcularHoras(e.hora_inicio, e.hora_fim), 0);

    const variacaoPlantoes = totalAnterior > 0 
      ? ((total - totalAnterior) / totalAnterior) * 100 
      : 0;
    const variacaoHoras = horasAnterior > 0 
      ? ((horasEscaladas - horasAnterior) / horasAnterior) * 100 
      : 0;
    const variacaoFuros = furosAnterior > 0 
      ? ((furos.length - furosAnterior) / furosAnterior) * 100 
      : 0;

    return {
      totalPlantoes: total,
      horasEscaladas: Math.round(horasEscaladas),
      profissionaisAtivos: profissionaisUnicos.size,
      mediaHorasPorProfissional: Math.round(mediaHorasPorProfissional * 10) / 10,
      mediaPlantoesporDia: Math.round(mediaPlantoesporDia * 10) / 10,
      percentualCompletos: Math.round(percentualCompletos * 10) / 10,
      totalFuros: furos.length,
      percentualFuros: Math.round(percentualFuros * 10) / 10,
      horasDescobertas: Math.round(horasDescobertas),
      diasComFuro: diasComFuro.size,
      incompletos: incompletos.length,
      variacaoPlantoes: Math.round(variacaoPlantoes * 10) / 10,
      variacaoHoras: Math.round(variacaoHoras * 10) / 10,
      variacaoFuros: Math.round(variacaoFuros * 10) / 10,
    };
  }, [escalas, escalasMesAnterior]);

  // Análises por dimensão
  const analises = useMemo(() => {
    const plantoesProdutivos = escalas.filter(e => !isFuroDeEscala(e.profissional_nome));
    const furos = escalas.filter(e => isFuroDeEscala(e.profissional_nome));

    // Por Setor
    const porSetor = escalas.reduce((acc, e) => {
      const setor = e.setor_nome || e.setor || "Não informado";
      if (!acc[setor]) acc[setor] = { plantoes: 0, horas: 0, furos: 0, horasFuros: 0 };
      acc[setor].plantoes++;
      const horas = calcularHoras(e.hora_inicio, e.hora_fim);
      if (isFuroDeEscala(e.profissional_nome)) {
        acc[setor].furos++;
        acc[setor].horasFuros += horas;
      } else {
        acc[setor].horas += horas;
      }
      return acc;
    }, {} as Record<string, { plantoes: number; horas: number; furos: number; horasFuros: number }>);

    // Por Local
    const porLocal = escalas.reduce((acc, e) => {
      const local = e.local_nome || e.unidade || "Não informado";
      if (!acc[local]) acc[local] = { plantoes: 0, horas: 0, furos: 0, horasFuros: 0 };
      acc[local].plantoes++;
      const horas = calcularHoras(e.hora_inicio, e.hora_fim);
      if (isFuroDeEscala(e.profissional_nome)) {
        acc[local].furos++;
        acc[local].horasFuros += horas;
      } else {
        acc[local].horas += horas;
      }
      return acc;
    }, {} as Record<string, { plantoes: number; horas: number; furos: number; horasFuros: number }>);

    // Top profissionais por horas
    const profissionaisHoras = plantoesProdutivos.reduce((acc, e) => {
      const nome = e.profissional_nome || "Não informado";
      if (!acc[nome]) acc[nome] = { horas: 0, plantoes: 0 };
      acc[nome].horas += calcularHoras(e.hora_inicio, e.hora_fim);
      acc[nome].plantoes++;
      return acc;
    }, {} as Record<string, { horas: number; plantoes: number }>);

    // Por dia da semana
    const porDiaSemana = escalas.reduce((acc, e) => {
      const dia = getDiaSemana(e.data_escala);
      if (!acc[dia]) acc[dia] = { plantoes: 0, furos: 0 };
      acc[dia].plantoes++;
      if (isFuroDeEscala(e.profissional_nome)) acc[dia].furos++;
      return acc;
    }, {} as Record<string, { plantoes: number; furos: number }>);

    // Por faixa de horário
    const porFaixaHorario = escalas.reduce((acc, e) => {
      const faixa = getFaixaHorario(e.hora_inicio);
      if (!acc[faixa]) acc[faixa] = { plantoes: 0, furos: 0 };
      acc[faixa].plantoes++;
      if (isFuroDeEscala(e.profissional_nome)) acc[faixa].furos++;
      return acc;
    }, {} as Record<string, { plantoes: number; furos: number }>);

    // Furos por dia (timeline)
    const furosPorDia = furos.reduce((acc, e) => {
      acc[e.data_escala] = (acc[e.data_escala] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      plantoesPorSetor: Object.entries(porSetor)
        .map(([nome, data]) => ({ nome, ...data }))
        .sort((a, b) => b.plantoes - a.plantoes),
      horasPorSetor: Object.entries(porSetor)
        .map(([nome, data]) => ({ nome, horas: Math.round(data.horas) }))
        .sort((a, b) => b.horas - a.horas),
      furosPorSetor: Object.entries(porSetor)
        .filter(([_, data]) => data.furos > 0)
        .map(([nome, data]) => ({ nome, furos: data.furos, horas: Math.round(data.horasFuros) }))
        .sort((a, b) => b.furos - a.furos),
      plantoesPorLocal: Object.entries(porLocal)
        .map(([nome, data]) => ({ nome, ...data }))
        .sort((a, b) => b.plantoes - a.plantoes),
      horasPorLocal: Object.entries(porLocal)
        .map(([nome, data]) => ({ nome, horas: Math.round(data.horas) }))
        .sort((a, b) => b.horas - a.horas),
      furosPorLocal: Object.entries(porLocal)
        .filter(([_, data]) => data.furos > 0)
        .map(([nome, data]) => ({ nome, furos: data.furos, horas: Math.round(data.horasFuros) }))
        .sort((a, b) => b.furos - a.furos),
      topProfissionaisPorHoras: Object.entries(profissionaisHoras)
        .map(([nome, data]) => ({ nome: nome.split(" ").slice(0, 2).join(" "), ...data, horas: Math.round(data.horas) }))
        .sort((a, b) => b.horas - a.horas)
        .slice(0, 10),
      topProfissionaisPorPlantoes: Object.entries(profissionaisHoras)
        .map(([nome, data]) => ({ nome: nome.split(" ").slice(0, 2).join(" "), ...data, horas: Math.round(data.horas) }))
        .sort((a, b) => b.plantoes - a.plantoes)
        .slice(0, 10),
      plantoesPorDiaSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
        .map(dia => ({ dia, plantoes: porDiaSemana[dia]?.plantoes || 0, furos: porDiaSemana[dia]?.furos || 0 })),
      plantoesPorFaixaHorario: ["Manhã", "Tarde", "Noite"]
        .map(faixa => ({ faixa, plantoes: porFaixaHorario[faixa]?.plantoes || 0, furos: porFaixaHorario[faixa]?.furos || 0 })),
      furosPorDia: Object.entries(furosPorDia)
        .map(([data, count]) => ({ data, furos: count }))
        .sort((a, b) => a.data.localeCompare(b.data)),
    };
  }, [escalas]);

  // Alertas estratégicos
  const alertas = useMemo<AlertaEscala[]>(() => {
    const result: AlertaEscala[] = [];

    // Alerta de furos críticos (>5% do total)
    if (metricas.percentualFuros > 5) {
      result.push({
        tipo: "risco",
        titulo: "Alta Taxa de Furos de Escala",
        descricao: `${metricas.percentualFuros}% dos plantões estão sem profissional alocado (${metricas.totalFuros} furos)`,
        valor: metricas.totalFuros,
      });
    }

    // Alerta de horas descobertas significativas
    if (metricas.horasDescobertas > 100) {
      result.push({
        tipo: "risco",
        titulo: "Horas Descobertas Críticas",
        descricao: `${metricas.horasDescobertas}h sem cobertura profissional no período`,
        valor: metricas.horasDescobertas,
      });
    }

    // Concentração de furos em setor específico
    const setorMaisFuros = analises.furosPorSetor[0];
    if (setorMaisFuros && setorMaisFuros.furos > 10) {
      result.push({
        tipo: "atencao",
        titulo: `Concentração de Furos em ${setorMaisFuros.nome}`,
        descricao: `${setorMaisFuros.furos} furos (${setorMaisFuros.horas}h descobertas) concentrados neste setor`,
        valor: setorMaisFuros.furos,
      });
    }

    // Alerta de qualidade de dados
    if (metricas.percentualCompletos < 90) {
      result.push({
        tipo: "atencao",
        titulo: "Qualidade de Dados Baixa",
        descricao: `${metricas.incompletos} registros com dados incompletos (${(100 - metricas.percentualCompletos).toFixed(1)}%)`,
        valor: metricas.incompletos,
      });
    }

    // Aumento de furos vs mês anterior
    if (metricas.variacaoFuros > 20) {
      result.push({
        tipo: "risco",
        titulo: "Aumento de Furos vs Mês Anterior",
        descricao: `Furos aumentaram ${metricas.variacaoFuros}% em relação ao mês anterior`,
        valor: metricas.variacaoFuros,
      });
    }

    // Dia da semana com mais furos
    const diaMaisFuros = analises.plantoesPorDiaSemana.reduce((max, d) => 
      d.furos > max.furos ? d : max, { dia: "", furos: 0 });
    if (diaMaisFuros.furos > 5) {
      result.push({
        tipo: "atencao",
        titulo: `${diaMaisFuros.dia} com Maior Risco`,
        descricao: `${diaMaisFuros.furos} furos concentrados neste dia da semana`,
        valor: diaMaisFuros.furos,
      });
    }

    return result;
  }, [metricas, analises]);

  return {
    // Filtros
    filters: { mes, ano, localId, setorId, profissional },
    setMes,
    setAno,
    setLocalId,
    setSetorId,
    setProfissional,
    // Opções de filtro
    locais,
    setores,
    // Dados
    escalas,
    metricas,
    analises,
    alertas,
    isLoading,
  };
}
