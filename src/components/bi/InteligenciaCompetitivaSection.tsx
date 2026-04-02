import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Trophy,
  Building2,
  TrendingDown,
  Target,
  AlertTriangle,
  Award,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/bi/InfoTip";

interface InteligenciaCompetitivaSectionProps {
  dataInicio?: Date | null;
  dataFim?: Date | null;
  modalidadeFiltro?: string;
  ufFiltro?: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const MOTIVO_LABELS: Record<string, string> = {
  preco: "Preço",
  documentacao: "Documentação",
  prazo: "Prazo",
  habilitacao_tecnica: "Habilitação Técnica",
  estrategia: "Estratégia",
  outros: "Outros",
};

const CLASSIFICACAO_LABELS: Record<string, string> = {
  primeiro_lugar: "1º Lugar",
  segundo_lugar: "2º Lugar",
  desclassificada: "Desclassificada",
  nao_habilitada: "Não Habilitada",
};

const MOTIVO_COLORS = [
  "hsl(0, 84%, 60%)",    // Preço - Vermelho
  "hsl(45, 93%, 47%)",   // Documentação - Amarelo
  "hsl(200, 80%, 50%)",  // Prazo - Azul
  "hsl(280, 60%, 50%)",  // Habilitação - Roxo
  "hsl(30, 80%, 50%)",   // Estratégia - Laranja
  "hsl(0, 0%, 50%)",     // Outros - Cinza
];

export function InteligenciaCompetitivaSection({
  dataInicio,
  dataFim,
  modalidadeFiltro,
  ufFiltro,
}: InteligenciaCompetitivaSectionProps) {
  // Buscar resultados de licitações com dados das licitações
  const { data: resultados = [], isLoading } = useQuery({
    queryKey: ["licitacao-resultados-bi", dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from("licitacao_resultados")
        .select(`
          *,
          licitacoes!inner (
            id,
            numero_edital,
            objeto,
            orgao,
            modalidade,
            municipio_uf,
            status,
            created_at
          )
        `)
        .order("created_at", { ascending: false });

      if (dataInicio) {
        query = query.gte("created_at", dataInicio.toISOString());
      }
      if (dataFim) {
        query = query.lte("created_at", dataFim.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Filtrar resultados
  const filteredResultados = useMemo(() => {
    return resultados.filter((r: any) => {
      if (modalidadeFiltro && modalidadeFiltro !== "all") {
        if (r.licitacoes?.subtipo_modalidade !== modalidadeFiltro) return false;
      }
      if (ufFiltro && ufFiltro !== "all") {
        const uf = r.licitacoes?.municipio_uf?.split("/").pop()?.trim();
        if (uf !== ufFiltro) return false;
      }
      return true;
    });
  }, [resultados, modalidadeFiltro, ufFiltro]);

  // Ranking de empresas vencedoras
  const rankingEmpresas = useMemo(() => {
    const empresasMap = new Map<string, { nome: string; vitorias: number; valor: number }>();

    filteredResultados.forEach((r: any) => {
      const nome = r.empresa_vencedora_nome;
      const existing = empresasMap.get(nome) || { nome, vitorias: 0, valor: 0 };
      existing.vitorias += 1;
      existing.valor += Number(r.valor_homologado) || 0;
      empresasMap.set(nome, existing);
    });

    return Array.from(empresasMap.values())
      .sort((a, b) => b.vitorias - a.vitorias)
      .slice(0, 10);
  }, [filteredResultados]);

  // Comparativo GSS vs Concorrentes
  const comparativoGss = useMemo(() => {
    const stats = {
      primeiroLugar: 0,
      segundoLugar: 0,
      desclassificada: 0,
      naoHabilitada: 0,
      total: filteredResultados.length,
      valorGanho: 0,
      valorPerdido: 0,
    };

    filteredResultados.forEach((r: any) => {
      const valor = Number(r.valor_homologado) || 0;
      switch (r.classificacao_gss) {
        case "primeiro_lugar":
          stats.primeiroLugar++;
          stats.valorGanho += valor;
          break;
        case "segundo_lugar":
          stats.segundoLugar++;
          stats.valorPerdido += valor;
          break;
        case "desclassificada":
          stats.desclassificada++;
          stats.valorPerdido += valor;
          break;
        case "nao_habilitada":
          stats.naoHabilitada++;
          stats.valorPerdido += valor;
          break;
      }
    });

    return stats;
  }, [filteredResultados]);

  // Motivos de perda mais frequentes
  const motivosPerda = useMemo(() => {
    const motivosMap = new Map<string, number>();

    filteredResultados.forEach((r: any) => {
      if (r.motivo_perda && r.classificacao_gss !== "primeiro_lugar") {
        motivosMap.set(r.motivo_perda, (motivosMap.get(r.motivo_perda) || 0) + 1);
      }
    });

    return Array.from(motivosMap.entries())
      .map(([motivo, count]) => ({
        motivo,
        label: MOTIVO_LABELS[motivo] || motivo,
        count,
        percentual: filteredResultados.length > 0 
          ? (count / filteredResultados.filter((r: any) => r.classificacao_gss !== "primeiro_lugar").length) * 100 
          : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredResultados]);

  // Histórico de vencedores por órgão
  const vencedoresPorOrgao = useMemo(() => {
    const orgaosMap = new Map<string, { orgao: string; vencedores: Map<string, number> }>();

    filteredResultados.forEach((r: any) => {
      const orgao = r.licitacoes?.orgao || "Não informado";
      const vencedor = r.empresa_vencedora_nome;

      if (!orgaosMap.has(orgao)) {
        orgaosMap.set(orgao, { orgao, vencedores: new Map() });
      }
      const orgaoData = orgaosMap.get(orgao)!;
      orgaoData.vencedores.set(vencedor, (orgaoData.vencedores.get(vencedor) || 0) + 1);
    });

    return Array.from(orgaosMap.values())
      .map((o) => ({
        orgao: o.orgao,
        totalLicitacoes: Array.from(o.vencedores.values()).reduce((a, b) => a + b, 0),
        topVencedor: Array.from(o.vencedores.entries()).sort((a, b) => b[1] - a[1])[0],
      }))
      .sort((a, b) => b.totalLicitacoes - a.totalLicitacoes)
      .slice(0, 8);
  }, [filteredResultados]);

  // Análise por modalidade
  const analisePorModalidade = useMemo(() => {
    const modalidadesMap = new Map<
      string,
      { modalidade: string; total: number; ganhas: number; valor: number }
    >();

    filteredResultados.forEach((r: any) => {
      const modalidade = r.licitacoes?.subtipo_modalidade || "Não informado";
      const existing = modalidadesMap.get(modalidade) || {
        modalidade,
        total: 0,
        ganhas: 0,
        valor: 0,
      };
      existing.total += 1;
      existing.valor += Number(r.valor_homologado) || 0;
      if (r.classificacao_gss === "primeiro_lugar") {
        existing.ganhas += 1;
      }
      modalidadesMap.set(modalidade, existing);
    });

    return Array.from(modalidadesMap.values())
      .map((m) => ({
        ...m,
        taxaConversao: m.total > 0 ? (m.ganhas / m.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredResultados]);

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (filteredResultados.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Inteligência Competitiva
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum resultado registrado</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-2">
              Os dados de inteligência competitiva aparecerão aqui quando você
              registrar o resultado das licitações ao encerrá-las.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const taxaVitoria = comparativoGss.total > 0 
    ? (comparativoGss.primeiroLugar / comparativoGss.total) * 100 
    : 0;

  return (
    <TooltipProvider>
      <div className="space-y-4">
      {/* Header */}
      <Card className="shadow-md bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Target className="h-5 w-5 text-primary" />
            Inteligência Competitiva
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {comparativoGss.total}
              </div>
              <div className="text-xs text-muted-foreground">Resultados Registrados</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">
                {taxaVitoria.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Taxa de Vitória GSS</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">
                {formatCurrency(comparativoGss.valorGanho)}
              </div>
              <div className="text-xs text-muted-foreground">Valor Conquistado</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500">
                {formatCurrency(comparativoGss.valorPerdido)}
              </div>
              <div className="text-xs text-muted-foreground">Valor Perdido</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking de Empresas Vencedoras */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Ranking de Empresas Vencedoras
              <InfoTip text="Lista as empresas que mais venceram no período (com soma do valor homologado). Útil para mapear concorrentes recorrentes." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {rankingEmpresas.map((empresa, index) => (
                  <div
                    key={empresa.nome}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? "bg-yellow-500 text-white"
                            : index === 1
                            ? "bg-gray-400 text-white"
                            : index === 2
                            ? "bg-amber-700 text-white"
                            : "bg-muted-foreground/20"
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[200px]">
                          {empresa.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(empresa.valor)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{empresa.vitorias} vitórias</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Motivos de Perda */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Motivos de Perda Mais Frequentes
              <InfoTip text="Distribuição dos motivos quando a GSS não ficou em 1º lugar. Ajuda a separar perdas por preço vs requisitos." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {motivosPerda.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={motivosPerda}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ label, percentual }) => `${label}: ${percentual.toFixed(0)}%`}
                    labelLine={false}
                  >
                    {motivosPerda.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={MOTIVO_COLORS[index % MOTIVO_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      `${value} ocorrências`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                Nenhum motivo de perda registrado
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Análise por Modalidade */}
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-primary" />
            Desempenho por Modalidade
            <InfoTip text="Compara volume total vs volume ganho por modalidade. Use para entender onde a taxa de vitória tende a ser melhor." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analisePorModalidade} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="modalidade"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <RechartsTooltip
                formatter={(value: number, name: string) => {
                  if (name === "ganhas") return [value, "Ganhas"];
                  if (name === "total") return [value, "Total"];
                  return [value, name];
                }}
              />
              <Bar dataKey="total" fill="hsl(var(--muted))" name="Total" />
              <Bar dataKey="ganhas" fill="hsl(142, 76%, 36%)" name="Ganhas" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Histórico por Órgão */}
      <Card className="shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Vencedores por Órgão
            <InfoTip text="Mostra, por órgão, o vencedor mais frequente e o volume de licitações. Útil para identificar padrões por cliente público." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {vencedoresPorOrgao.map((item) => (
                <div
                  key={item.orgao}
                  className="flex items-center justify-between p-2 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.orgao}</p>
                    {item.topVencedor && (
                      <p className="text-xs text-muted-foreground">
                        Líder: {item.topVencedor[0]} ({item.topVencedor[1]} vitórias)
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">{item.totalLicitacoes} licitações</Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}
