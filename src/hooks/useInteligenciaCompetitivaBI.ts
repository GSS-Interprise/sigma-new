import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodoRapido = "mes_atual" | "mes_anterior" | "trimestre" | "semestre" | "ano" | "personalizado";

interface ItemConcorrente {
  id: string;
  item_id: string;
  empresa_id: string | null;
  empresa_nome: string;
  empresa_cnpj: string | null;
  valor_ofertado: number;
  posicao: number;
  situacao: string;
  motivo_situacao: string | null;
  is_gss: boolean;
  is_vencedor: boolean;
  created_at: string;
}

interface LicitacaoItem {
  id: string;
  licitacao_id: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  valor_referencia: number | null;
  quantidade: number | null;
  created_at: string;
  licitacao_item_concorrentes: ItemConcorrente[];
}

interface LicitacaoResultado {
  id: string;
  licitacao_id: string;
  empresa_vencedora_nome: string | null;
  valor_homologado: number | null;
  classificacao_gss: string | null;
  motivo_perda: string | null;
  observacoes_estrategicas: string | null;
  created_at: string;
}

const TIPO_ITEM_LABELS: Record<string, string> = {
  consulta: "Consultas",
  exame: "Exames",
  servico: "Serviços",
  plantao: "Plantões",
  especialidade: "Especialidades",
  outro: "Outros",
};

export function useInteligenciaCompetitivaBI() {
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("ano");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tipoItemFiltro, setTipoItemFiltro] = useState("all");
  const [concorrenteFiltro, setConcorrenteFiltro] = useState("all");

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
        return { inicio: subMonths(hoje, 3), fim: hoje };
      case "semestre":
        return { inicio: subMonths(hoje, 6), fim: hoje };
      case "ano":
        return { inicio: subMonths(hoje, 12), fim: hoje };
      case "personalizado":
        return { 
          inicio: dataInicio ? new Date(dataInicio) : subMonths(hoje, 3), 
          fim: dataFim ? new Date(dataFim) : hoje 
        };
      default:
        return { inicio: subMonths(hoje, 12), fim: hoje };
    }
  }, [periodoRapido, dataInicio, dataFim]);

  // Fetch all items with competitors
  const { data: itensData, isLoading: isLoadingItens } = useQuery({
    queryKey: ["bi-inteligencia-competitiva-itens", dateRange.inicio, dateRange.fim],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("licitacao_itens")
        .select(`
          *,
          licitacao_item_concorrentes(*)
        `)
        .gte("created_at", dateRange.inicio.toISOString())
        .lte("created_at", dateRange.fim.toISOString())
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data || []) as LicitacaoItem[];
    },
  });

  // Fetch results for motivo_perda
  const { data: resultadosData, isLoading: isLoadingResultados } = useQuery({
    queryKey: ["bi-inteligencia-competitiva-resultados", dateRange.inicio, dateRange.fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacao_resultados")
        .select("*")
        .gte("created_at", dateRange.inicio.toISOString())
        .lte("created_at", dateRange.fim.toISOString());
      
      if (error) throw error;
      return (data || []) as LicitacaoResultado[];
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!itensData) return null;

    const itens = tipoItemFiltro === "all" 
      ? itensData 
      : itensData.filter(i => i.tipo === tipoItemFiltro);

    // 1. Ranking médio por tipo de item
    const rankingPorTipo: Record<string, { soma: number; count: number }> = {};
    
    // 2. Diferença percentual de preço
    const diferencasPreco: { item: string; tipo: string; diferencaPercent: number; valorGSS: number; valorVencedor: number }[] = [];
    
    // 3. Concorrentes que venceram da GSS
    const concorrentesVitorias: Record<string, { nome: string; vitorias: number; disputas: number; valorMedio: number; valoresTotal: number }> = {};
    
    // 4. Taxa de vitória por tipo
    const vitoriaPorTipo: Record<string, { vitorias: number; total: number }> = {};
    
    // 5. Motivos de perda
    const motivosPerda: Record<string, number> = {
      "Preço acima": 0,
      "Desclassificação": 0,
      "Inabilitação": 0,
      "Outro": 0,
    };

    // 6. Evolução temporal
    const evolucaoMensal: Record<string, { mes: string; rankingMedio: number; taxaVitoria: number; count: number; vitorias: number }> = {};

    // 7. Tabela detalhada
    const tabelaDetalhada: {
      item: string;
      tipo: string;
      valorVencedor: number;
      valorGSS: number;
      diferencaReais: number;
      diferencaPercent: number;
      posicaoGSS: number;
      empresaVencedora: string;
      dataItem: string;
    }[] = [];

    itens.forEach(item => {
      const concorrentes = item.licitacao_item_concorrentes || [];
      const gss = concorrentes.find(c => c.is_gss);
      const vencedor = concorrentes.find(c => c.is_vencedor);
      const tipoLabel = TIPO_ITEM_LABELS[item.tipo] || item.tipo;
      const mesKey = format(new Date(item.created_at), "yyyy-MM");

      // Inicializar estruturas
      if (!rankingPorTipo[tipoLabel]) rankingPorTipo[tipoLabel] = { soma: 0, count: 0 };
      if (!vitoriaPorTipo[tipoLabel]) vitoriaPorTipo[tipoLabel] = { vitorias: 0, total: 0 };
      if (!evolucaoMensal[mesKey]) {
        evolucaoMensal[mesKey] = { 
          mes: format(new Date(item.created_at), "MMM/yy", { locale: ptBR }), 
          rankingMedio: 0, 
          taxaVitoria: 0, 
          count: 0, 
          vitorias: 0 
        };
      }

      // Atualizar taxa de vitória por tipo
      vitoriaPorTipo[tipoLabel].total++;
      if (gss?.is_vencedor) {
        vitoriaPorTipo[tipoLabel].vitorias++;
      }

      // Atualizar evolução mensal
      evolucaoMensal[mesKey].count++;
      if (gss?.is_vencedor) {
        evolucaoMensal[mesKey].vitorias++;
      }

      if (gss) {
        // Ranking médio
        rankingPorTipo[tipoLabel].soma += gss.posicao;
        rankingPorTipo[tipoLabel].count++;
        evolucaoMensal[mesKey].rankingMedio += gss.posicao;

        // Diferença de preço vs vencedor
        if (vencedor && vencedor.valor_ofertado > 0) {
          const diferencaPercent = ((gss.valor_ofertado - vencedor.valor_ofertado) / vencedor.valor_ofertado) * 100;
          
          diferencasPreco.push({
            item: item.nome,
            tipo: tipoLabel,
            diferencaPercent,
            valorGSS: gss.valor_ofertado,
            valorVencedor: vencedor.valor_ofertado,
          });

          // Tabela detalhada
          tabelaDetalhada.push({
            item: item.nome,
            tipo: tipoLabel,
            valorVencedor: vencedor.valor_ofertado,
            valorGSS: gss.valor_ofertado,
            diferencaReais: gss.valor_ofertado - vencedor.valor_ofertado,
            diferencaPercent,
            posicaoGSS: gss.posicao,
            empresaVencedora: vencedor.empresa_nome,
            dataItem: item.created_at,
          });
        }

        // Motivos de perda (baseado na situação da GSS)
        if (!gss.is_vencedor) {
          if (gss.situacao === "desclassificada") {
            motivosPerda["Desclassificação"]++;
          } else if (gss.situacao === "inabilitada") {
            motivosPerda["Inabilitação"]++;
          } else if (vencedor && gss.valor_ofertado > vencedor.valor_ofertado) {
            motivosPerda["Preço acima"]++;
          } else {
            motivosPerda["Outro"]++;
          }
        }
      }

      // Concorrentes que venceram
      if (vencedor && !vencedor.is_gss) {
        const nome = vencedor.empresa_nome;
        if (!concorrentesVitorias[nome]) {
          concorrentesVitorias[nome] = { nome, vitorias: 0, disputas: 0, valorMedio: 0, valoresTotal: 0 };
        }
        concorrentesVitorias[nome].vitorias++;
        concorrentesVitorias[nome].valoresTotal += vencedor.valor_ofertado;
      }

      // Disputas diretas com GSS
      if (gss) {
        concorrentes.filter(c => !c.is_gss).forEach(c => {
          const nome = c.empresa_nome;
          if (!concorrentesVitorias[nome]) {
            concorrentesVitorias[nome] = { nome, vitorias: 0, disputas: 0, valorMedio: 0, valoresTotal: 0 };
          }
          concorrentesVitorias[nome].disputas++;
        });
      }
    });

    // Processar ranking médio por tipo
    const rankingMedioPorTipo = Object.entries(rankingPorTipo)
      .map(([tipo, data]) => ({
        tipo,
        rankingMedio: data.count > 0 ? data.soma / data.count : 0,
      }))
      .sort((a, b) => a.rankingMedio - b.rankingMedio);

    // Processar taxa de vitória por tipo
    const taxaVitoriaPorTipo = Object.entries(vitoriaPorTipo)
      .map(([tipo, data]) => ({
        tipo,
        taxaVitoria: data.total > 0 ? (data.vitorias / data.total) * 100 : 0,
        vitorias: data.vitorias,
        perdas: data.total - data.vitorias,
        total: data.total,
      }))
      .sort((a, b) => b.taxaVitoria - a.taxaVitoria);

    // Top 10 concorrentes
    const topConcorrentes = Object.values(concorrentesVitorias)
      .map(c => ({
        ...c,
        valorMedio: c.vitorias > 0 ? c.valoresTotal / c.vitorias : 0,
      }))
      .sort((a, b) => b.vitorias - a.vitorias)
      .slice(0, 10);

    // Motivos de perda para gráfico
    const motivosPerdaData = Object.entries(motivosPerda)
      .filter(([_, count]) => count > 0)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);

    // Evolução temporal ordenada
    const evolucaoData = Object.entries(evolucaoMensal)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, data]) => ({
        mes: data.mes,
        rankingMedio: data.count > 0 ? data.rankingMedio / data.count : 0,
        taxaVitoria: data.count > 0 ? (data.vitorias / data.count) * 100 : 0,
      }));

    // Diferença média de preço por tipo
    const diferencaMediaPorTipo: Record<string, { soma: number; count: number }> = {};
    diferencasPreco.forEach(d => {
      if (!diferencaMediaPorTipo[d.tipo]) diferencaMediaPorTipo[d.tipo] = { soma: 0, count: 0 };
      diferencaMediaPorTipo[d.tipo].soma += d.diferencaPercent;
      diferencaMediaPorTipo[d.tipo].count++;
    });

    const diferencaPrecoMediaPorTipo = Object.entries(diferencaMediaPorTipo)
      .map(([tipo, data]) => ({
        tipo,
        diferencaMedia: data.count > 0 ? data.soma / data.count : 0,
      }))
      .sort((a, b) => a.diferencaMedia - b.diferencaMedia);

    // KPIs gerais
    const totalItens = itens.length;
    const itensComGSS = itens.filter(i => i.licitacao_item_concorrentes?.some(c => c.is_gss)).length;
    const vitoriasGSS = itens.filter(i => i.licitacao_item_concorrentes?.some(c => c.is_gss && c.is_vencedor)).length;
    const taxaVitoriaGeral = itensComGSS > 0 ? (vitoriasGSS / itensComGSS) * 100 : 0;
    
    const rankingGeralSoma = Object.values(rankingPorTipo).reduce((acc, v) => acc + v.soma, 0);
    const rankingGeralCount = Object.values(rankingPorTipo).reduce((acc, v) => acc + v.count, 0);
    const rankingMedioGeral = rankingGeralCount > 0 ? rankingGeralSoma / rankingGeralCount : 0;

    const diferencaMediaGeral = diferencasPreco.length > 0
      ? diferencasPreco.reduce((acc, d) => acc + d.diferencaPercent, 0) / diferencasPreco.length
      : 0;

    return {
      kpis: {
        totalItens,
        itensComGSS,
        vitoriasGSS,
        taxaVitoriaGeral,
        rankingMedioGeral,
        diferencaMediaGeral,
      },
      rankingMedioPorTipo,
      taxaVitoriaPorTipo,
      topConcorrentes,
      motivosPerdaData,
      evolucaoData,
      diferencaPrecoMediaPorTipo,
      tabelaDetalhada: tabelaDetalhada.slice(0, 50), // Limitar para performance
    };
  }, [itensData, tipoItemFiltro]);

  // Lista de concorrentes únicos para filtro
  const concorrentesUnicos = useMemo(() => {
    if (!itensData) return [];
    const nomes = new Set<string>();
    itensData.forEach(item => {
      item.licitacao_item_concorrentes?.forEach(c => {
        if (!c.is_gss && c.empresa_nome) {
          nomes.add(c.empresa_nome);
        }
      });
    });
    return Array.from(nomes).sort();
  }, [itensData]);

  // Tipos de item únicos para filtro
  const tiposItemUnicos = useMemo(() => {
    if (!itensData) return [];
    const tipos = new Set<string>();
    itensData.forEach(item => {
      if (item.tipo) tipos.add(item.tipo);
    });
    return Array.from(tipos).map(t => ({
      value: t,
      label: TIPO_ITEM_LABELS[t] || t,
    }));
  }, [itensData]);

  return {
    // Filters
    periodoRapido,
    setPeriodoRapido,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    tipoItemFiltro,
    setTipoItemFiltro,
    concorrenteFiltro,
    setConcorrenteFiltro,
    dateRange,
    
    // Data
    metrics,
    tiposItemUnicos,
    concorrentesUnicos,
    
    // Loading
    isLoading: isLoadingItens || isLoadingResultados,
  };
}
