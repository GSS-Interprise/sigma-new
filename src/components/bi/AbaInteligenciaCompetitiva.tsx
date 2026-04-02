import { useInteligenciaCompetitivaBI, PeriodoRapido } from "@/hooks/useInteligenciaCompetitivaBI";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie, ReferenceLine
} from "recharts";
import { 
  TrendingUp, TrendingDown, Trophy, Target, Users, 
  BarChart3, AlertTriangle, CheckCircle2, XCircle, Minus, Info
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

// Colors for charts
const COLORS = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(142, 76%, 36%)',
  danger: 'hsl(0, 84%, 60%)',
  warning: 'hsl(45, 93%, 47%)',
  info: 'hsl(200, 80%, 50%)',
  muted: 'hsl(var(--muted))',
};

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#6b7280'];

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Ver explicação"
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// KPI Card Component
function KPICard({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  variant = "default",
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "danger" | "success";
  isLoading?: boolean;
}) {
  const bgClass = variant === "warning" 
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" 
    : variant === "danger" 
      ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
      : variant === "success"
        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
        : "bg-card border-border";
  
  const iconClass = variant === "warning" 
    ? "text-amber-600" 
    : variant === "danger" 
      ? "text-red-600" 
      : variant === "success"
        ? "text-emerald-600"
        : "text-primary";

  if (isLoading) {
    return (
      <Card className={`shadow-md ${bgClass}`}>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`shadow-md hover:shadow-lg transition-shadow ${bgClass}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export function AbaInteligenciaCompetitiva() {
  const {
    periodoRapido,
    setPeriodoRapido,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    tipoItemFiltro,
    setTipoItemFiltro,
    tiposItemUnicos,
    metrics,
    isLoading,
  } = useInteligenciaCompetitivaBI();

  const kpis = metrics?.kpis;

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Período</Label>
              <Select value={periodoRapido} onValueChange={(v) => setPeriodoRapido(v as PeriodoRapido)}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="trimestre">Trimestre</SelectItem>
                  <SelectItem value="semestre">Semestre</SelectItem>
                  <SelectItem value="ano">Último Ano</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodoRapido === "personalizado" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data Início</Label>
                  <Input 
                    type="date" 
                    value={dataInicio} 
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-[140px] h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data Fim</Label>
                  <Input 
                    type="date" 
                    value={dataFim} 
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-[140px] h-9"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Item</Label>
              <Select value={tipoItemFiltro} onValueChange={setTipoItemFiltro}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {tiposItemUnicos.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs - Bloco 1: Visão Geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard
          title="Itens Analisados"
          value={kpis?.totalItens || 0}
          subtitle="Total no período"
          icon={BarChart3}
          isLoading={isLoading}
        />
        <KPICard
          title="Participações GSS"
          value={kpis?.itensComGSS || 0}
          subtitle="Itens com proposta GSS"
          icon={Target}
          isLoading={isLoading}
        />
        <KPICard
          title="Vitórias GSS"
          value={kpis?.vitoriasGSS || 0}
          subtitle="Itens arrematados"
          icon={Trophy}
          variant="success"
          isLoading={isLoading}
        />
        <KPICard
          title="Taxa de Vitória"
          value={formatPercent(kpis?.taxaVitoriaGeral || 0)}
          subtitle="% de sucesso"
          icon={kpis?.taxaVitoriaGeral && kpis.taxaVitoriaGeral >= 20 ? CheckCircle2 : XCircle}
          variant={kpis?.taxaVitoriaGeral && kpis.taxaVitoriaGeral >= 20 ? "success" : "danger"}
          isLoading={isLoading}
        />
        <KPICard
          title="Ranking Médio"
          value={kpis?.rankingMedioGeral ? `${kpis.rankingMedioGeral.toFixed(1)}º` : "-"}
          subtitle="Posição média da GSS"
          icon={kpis?.rankingMedioGeral && kpis.rankingMedioGeral <= 3 ? TrendingUp : TrendingDown}
          variant={kpis?.rankingMedioGeral && kpis.rankingMedioGeral <= 3 ? "success" : "warning"}
          isLoading={isLoading}
        />
        <KPICard
          title="Δ Preço Médio"
          value={kpis?.diferencaMediaGeral !== undefined ? `${kpis.diferencaMediaGeral > 0 ? "+" : ""}${kpis.diferencaMediaGeral.toFixed(1)}%` : "-"}
          subtitle="vs empresa vencedora"
          icon={kpis?.diferencaMediaGeral && kpis.diferencaMediaGeral <= 0 ? TrendingDown : TrendingUp}
          variant={kpis?.diferencaMediaGeral && kpis.diferencaMediaGeral <= 0 ? "success" : "danger"}
          isLoading={isLoading}
        />
      </div>

      {/* Bloco 2 - Itens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Ranking Médio por Tipo de Item */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Ranking Médio da GSS por Item
              <InfoTip text="Mostra a posição média da GSS (1º, 2º, 3º...) em cada tipo de item. Quanto menor o número, melhor a competitividade (mais perto de vencer)." />
            </CardTitle>
            <CardDescription>Posição média da GSS em cada tipo de item</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : metrics?.rankingMedioPorTipo.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics?.rankingMedioPorTipo} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="tipo" width={70} tick={{ fontSize: 12 }} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}º lugar`, "Ranking Médio"]}
                  />
                  <Bar dataKey="rankingMedio" radius={[0, 4, 4, 0]}>
                    {metrics?.rankingMedioPorTipo.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.rankingMedio <= 2 ? COLORS.success : entry.rankingMedio <= 4 ? COLORS.warning : COLORS.danger} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 4: Taxa de Vitória por Tipo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Taxa de Vitória da GSS por Item
              <InfoTip text="Compara vitórias vs perdas por tipo de item. A taxa de vitória é a % de itens em que a GSS ficou em 1º lugar dentro daquele tipo." />
            </CardTitle>
            <CardDescription>Percentual de vitórias por tipo de item</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : metrics?.taxaVitoriaPorTipo.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics?.taxaVitoriaPorTipo} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="tipo" width={70} tick={{ fontSize: 12 }} />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => {
                      if (name === "vitorias") return [value, "Vitórias"];
                      if (name === "perdas") return [value, "Perdas"];
                      return [`${value.toFixed(1)}%`, "Taxa"];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="vitorias" name="Vitórias" stackId="a" fill={COLORS.success} />
                  <Bar dataKey="perdas" name="Perdas" stackId="a" fill={COLORS.danger} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bloco 3 - Concorrentes e Preço */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 2: Diferença de Preço por Tipo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {(metrics?.kpis?.diferencaMediaGeral || 0) > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-green-500" />
              )}
              Diferença de Preço vs Vencedor
              <InfoTip text="Mede o quanto o preço da GSS ficou acima/abaixo do vencedor. Valores positivos = GSS mais cara (piora competitividade); negativos = GSS mais barata (melhora competitividade)." />
            </CardTitle>
            <CardDescription>Média percentual por tipo de item (+ = GSS mais cara)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : metrics?.diferencaPrecoMediaPorTipo.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics?.diferencaPrecoMediaPorTipo} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
                  <YAxis type="category" dataKey="tipo" width={70} tick={{ fontSize: 12 }} />
                  <RechartsTooltip 
                    formatter={(value: number) => [`${value > 0 ? "+" : ""}${value.toFixed(1)}%`, "Diferença"]}
                  />
                  <ReferenceLine x={0} stroke="#666" />
                  <Bar dataKey="diferencaMedia" radius={[0, 4, 4, 0]}>
                    {metrics?.diferencaPrecoMediaPorTipo.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.diferencaMedia <= 0 ? COLORS.success : COLORS.danger} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 3: Top Concorrentes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Principais Concorrentes
              <InfoTip text="Ranking das empresas que mais venceram quando houve disputa direta com a GSS. 'Vitórias' = vezes que venceram a GSS; 'Disputas' = quantas vezes concorreram no mesmo item." />
            </CardTitle>
            <CardDescription>Top 10 empresas que venceram em disputas com GSS</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : metrics?.topConcorrentes.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics?.topConcorrentes} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    type="category" 
                    dataKey="nome" 
                    width={90} 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.length > 15 ? v.slice(0, 15) + "..." : v}
                  />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => {
                      if (name === "vitorias") return [value, "Vitórias sobre GSS"];
                      if (name === "disputas") return [value, "Disputas diretas"];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="vitorias" name="Vitórias" fill={COLORS.danger} />
                  <Bar dataKey="disputas" name="Disputas" fill={COLORS.info} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bloco 4 - Análise Profunda */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico 5: Motivos de Perda */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Motivos de Perda
              <InfoTip text="Distribui os principais motivos registrados quando a GSS não venceu. Ajuda a separar problema de preço vs requisitos (documentação, habilitação, prazo, etc.)." />
            </CardTitle>
            <CardDescription>Distribuição das razões de não vitória</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : metrics?.motivosPerdaData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={metrics?.motivosPerdaData}
                    dataKey="count"
                    nameKey="motivo"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                    label={({ motivo, percent }) => `${motivo}: ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {metrics?.motivosPerdaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => [value, "Ocorrências"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico 7: Evolução da Competitividade */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Evolução da Competitividade
              <InfoTip text="Mostra tendência mensal: linha do ranking médio (quanto menor, melhor) e linha da taxa de vitória (quanto maior, melhor). Útil para ver se ações recentes melhoraram resultados." />
            </CardTitle>
            <CardDescription>Ranking médio e taxa de vitória ao longo do tempo</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : metrics?.evolucaoData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={metrics?.evolucaoData} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis 
                    yAxisId="left" 
                    orientation="left" 
                    domain={[0, 'auto']}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Ranking', angle: -90, position: 'insideLeft', fontSize: 10 }}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11 }}
                    label={{ value: 'Taxa %', angle: 90, position: 'insideRight', fontSize: 10 }}
                  />
                  <RechartsTooltip 
                    formatter={(value: number, name: string) => {
                      if (name === "rankingMedio") return [`${value.toFixed(1)}º`, "Ranking Médio"];
                      return [`${value.toFixed(1)}%`, "Taxa de Vitória"];
                    }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="rankingMedio" 
                    name="Ranking Médio"
                    stroke={COLORS.info} 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="taxaVitoria" 
                    name="Taxa de Vitória"
                    stroke={COLORS.success} 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico 6: Tabela Estratégica */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Comparativo Detalhado por Item
            <InfoTip text="Tabela item a item para análise fina: compara valores da GSS vs vencedor, diferença em R$ e %, e a posição da GSS. Use para decisões de precificação e entendimento de perda." />
          </CardTitle>
          <CardDescription>Análise item a item para reuniões estratégicas e precificação</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : metrics?.tabelaDetalhada.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              Sem dados para exibir
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor Vencedor</TableHead>
                    <TableHead className="text-right">Valor GSS</TableHead>
                    <TableHead className="text-right">Δ (R$)</TableHead>
                    <TableHead className="text-right">Δ (%)</TableHead>
                    <TableHead className="text-center">Posição GSS</TableHead>
                    <TableHead>Empresa Vencedora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics?.tabelaDetalhada.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={row.item}>
                        {row.item}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(row.valorVencedor)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(row.valorGSS)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-sm",
                        row.diferencaReais > 0 ? "text-red-600" : row.diferencaReais < 0 ? "text-green-600" : ""
                      )}>
                        {row.diferencaReais > 0 ? "+" : ""}{formatCurrency(row.diferencaReais)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-sm font-medium",
                        row.diferencaPercent > 0 ? "text-red-600" : row.diferencaPercent < 0 ? "text-green-600" : ""
                      )}>
                        {row.diferencaPercent > 0 ? "+" : ""}{row.diferencaPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={row.posicaoGSS === 1 ? "default" : "secondary"}
                          className={cn(
                            row.posicaoGSS === 1 && "bg-green-500 hover:bg-green-600"
                          )}
                        >
                          {row.posicaoGSS}º
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={row.empresaVencedora}>
                        {row.empresaVencedora}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}
