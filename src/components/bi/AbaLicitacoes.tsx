import { useState } from "react";
import { useLicitacoesBI, PeriodoRapido, AlertaLicitacao } from "@/hooks/useLicitacoesBI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend, ReferenceLine
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, 
  Filter, Trophy, ShieldAlert, Target, Lightbulb, ArrowRight, 
  BarChart3, FileText, CheckCircle2, XCircle, Clock, Zap, ExternalLink
} from "lucide-react";
import { InteligenciaCompetitivaSection } from "./InteligenciaCompetitivaSection";
import { AlertaDrilldownDialog } from "./AlertaDrilldownDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/bi/InfoTip";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

// Status colors
const getStatusColor = (category: string) => {
  switch (category) {
    case 'ganha': return 'hsl(142, 76%, 36%)';
    case 'perdida': return 'hsl(0, 84%, 60%)';
    case 'disputa': return 'hsl(200, 80%, 50%)';
    case 'deliberacao': return 'hsl(280, 60%, 50%)';
    case 'recurso': return 'hsl(45, 93%, 47%)';
    case 'homologacao': return 'hsl(160, 60%, 45%)';
    case 'captacao': return 'hsl(220, 70%, 50%)';
    case 'cadastro': return 'hsl(180, 60%, 45%)';
    case 'analise': return 'hsl(260, 50%, 55%)';
    default: return 'hsl(var(--muted))';
  }
};

// KPI Card
function KPICard({ 
  title, 
  value, 
  subtitle,
  icon: Icon, 
  variacao, 
  variacaoLabel = "vs período anterior",
  variant = "default",
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  variacao?: number;
  variacaoLabel?: string;
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
      <Card className={`shadow-md hover:shadow-lg transition-shadow ${bgClass}`}>
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-7 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
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
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
        {variacao !== undefined && variacao !== 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            {variacao >= 0 ? (
              <TrendingUp className="h-3 w-3 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600" />
            )}
            <span className={`text-xs font-medium ${variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {variacao >= 0 ? '+' : ''}{formatPercent(variacao)}
            </span>
            <span className="text-xs text-muted-foreground">{variacaoLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Chart skeleton
function ChartSkeleton() {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[280px] w-full" />
      </CardContent>
    </Card>
  );
}

// Alert Card - now clickable for drill-down
function AlertCard({ alerta, onClick }: { alerta: AlertaLicitacao; onClick?: () => void }) {
  const hasLicitacoes = alerta.licitacoes && alerta.licitacoes.length > 0;
  
  const bgClass = alerta.tipo === 'risco'
    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
    : alerta.tipo === 'oportunidade'
      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
      : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800';
  
  const Icon = alerta.tipo === 'risco' 
    ? ShieldAlert 
    : alerta.tipo === 'oportunidade' 
      ? Lightbulb 
      : AlertTriangle;
  
  const iconClass = alerta.tipo === 'risco'
    ? 'text-red-600'
    : alerta.tipo === 'oportunidade'
      ? 'text-emerald-600'
      : 'text-amber-600';

  return (
    <div 
      className={`p-3 rounded-lg border ${bgClass} ${hasLicitacoes ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={hasLicitacoes ? onClick : undefined}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{alerta.titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
          {alerta.acao && (
            <div className="flex items-center gap-1 mt-2">
              <ArrowRight className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">{alerta.acao}</span>
            </div>
          )}
          {hasLicitacoes && (
            <div className="flex items-center gap-1 mt-2 text-xs text-primary/70">
              <ExternalLink className="h-3 w-3" />
              <span>Clique para ver detalhes</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Evolution tooltip
function EvolucaoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-base">{label}</p>
      <div className="space-y-1 mt-2">
        <p className="text-sm">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2" />
          Iniciadas: <span className="font-bold">{data.iniciadas}</span>
        </p>
        {!data.isProjection && (
          <>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-full bg-slate-400 mr-2" />
              Encerradas: <span className="font-bold">{data.encerradas}</span>
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2" />
              Ganhas: <span className="font-bold">{data.ganhas}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Taxa de Conversão: <span className="font-medium">{formatPercent(data.taxaConversao)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Valor Potencial: <span className="font-medium">{formatCurrency(data.valorPotencial)}</span>
            </p>
          </>
        )}
      </div>
      {data.isProjection && (
        <Badge variant="secondary" className="mt-2">Projeção</Badge>
      )}
    </div>
  );
}

// Modalidade tooltip
function ModalidadeTooltip({ active, payload, metrica }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg min-w-[200px]">
      <p className="font-semibold text-base">{data.modalidade}</p>
      <div className="space-y-1 mt-2">
        {metrica === 'valor' ? (
          <>
            <p className="text-sm">Valor Atual: <span className="font-bold">{formatCurrency(data.valor)}</span></p>
            <p className="text-sm text-muted-foreground">Anterior: {formatCurrency(data.valorAnterior)}</p>
          </>
        ) : (
          <>
            <p className="text-sm">Quantidade Atual: <span className="font-bold">{data.quantidade}</span></p>
            <p className="text-sm text-muted-foreground">Anterior: {data.quantidadeAnterior}</p>
          </>
        )}
        <p className="text-sm">Taxa de Conversão: <span className="font-medium">{formatPercent(data.taxaConversao)}</span></p>
      </div>
    </div>
  );
}

export function AbaLicitacoes() {
  const [alertaSelecionado, setAlertaSelecionado] = useState<AlertaLicitacao | null>(null);
  
  const {
    periodoRapido,
    setPeriodoRapido,
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
    isLoading,
    kpis,
    statusData,
    modalidadeData,
    evolucaoMensal,
    funilData,
    alertas,
    STATUS_LABELS
  } = useLicitacoesBI();

  return (
    <TooltipProvider>
      <div className="space-y-4">
      {/* Filters */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filtros</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge 
                variant={filtroRapido === 'todas' ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setFiltroRapido('todas')}
              >
                Todas
              </Badge>
              <Badge 
                variant={filtroRapido === 'ativas' ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setFiltroRapido('ativas')}
              >
                Ativas
              </Badge>
              <Badge 
                variant={filtroRapido === 'disputa' ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setFiltroRapido('disputa')}
              >
                Em Disputa
              </Badge>
              <Badge 
                variant={filtroRapido === 'encerradas' ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setFiltroRapido('encerradas')}
              >
                Encerradas
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1 block">Período</Label>
              <Select value={periodoRapido} onValueChange={(v) => setPeriodoRapido(v as PeriodoRapido)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="trimestre">Último Trimestre</SelectItem>
                  <SelectItem value="semestre">Último Semestre</SelectItem>
                  <SelectItem value="ano">Último Ano</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {periodoRapido === "personalizado" && (
              <>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Data Início</Label>
                  <Input type="date" className="h-9" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Data Fim</Label>
                  <Input type="date" className="h-9" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              </>
            )}
            
            <div>
              <Label className="text-xs font-medium mb-1 block">Status</Label>
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.status.map(status => (
                    <SelectItem key={status} value={status}>{STATUS_LABELS[status] || status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs font-medium mb-1 block">Modalidade</Label>
              <Select value={modalidadeFiltro} onValueChange={setModalidadeFiltro}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.modalidades.map(mod => (
                    <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-medium mb-1 block">Faixa de Valor</Label>
              <Select value={faixaValorFiltro} onValueChange={setFaixaValorFiltro}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="ate_50k">Até R$ 50 mil</SelectItem>
                  <SelectItem value="50k_200k">R$ 50 - 200 mil</SelectItem>
                  <SelectItem value="200k_500k">R$ 200 - 500 mil</SelectItem>
                  <SelectItem value="500k_1m">R$ 500 mil - 1 mi</SelectItem>
                  <SelectItem value="acima_1m">Acima de R$ 1 mi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs - 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Total no Período"
          value={kpis.total}
          icon={FileText}
          variacao={kpis.variacaoTotal}
          isLoading={isLoading}
        />
        <KPICard
          title="Licitações Ativas"
          value={kpis.ativas}
          subtitle="Em andamento"
          icon={Clock}
          variant="default"
          isLoading={isLoading}
        />
        <KPICard
          title="Licitações Ganhas"
          value={kpis.ganhas}
          icon={CheckCircle2}
          variant="success"
          isLoading={isLoading}
        />
        <KPICard
          title="Licitações Perdidas"
          value={kpis.perdidas}
          icon={XCircle}
          variant="danger"
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Taxa de Conversão"
          value={formatPercent(kpis.taxaConversao)}
          subtitle="Ganhas / Encerradas"
          icon={Target}
          variacao={kpis.variacaoConversao}
          variacaoLabel="pontos percentuais"
          variant={kpis.taxaConversao >= 20 ? "success" : kpis.taxaConversao >= 10 ? "default" : "warning"}
          isLoading={isLoading}
        />
        <KPICard
          title="Valor do Pipeline"
          value={formatCurrency(kpis.valorPotencial)}
          subtitle="Licitações ativas"
          icon={DollarSign}
          variacao={kpis.variacaoValorPotencial}
          isLoading={isLoading}
        />
        <KPICard
          title="Valor Convertido"
          value={formatCurrency(kpis.valorConvertido)}
          subtitle="Licitações ganhas"
          icon={Trophy}
          variant="success"
          isLoading={isLoading}
        />
        <KPICard
          title="Encerradas"
          value={kpis.encerradas}
          subtitle="Finalizadas no período"
          icon={Zap}
          isLoading={isLoading}
        />
      </div>

      {/* Alerts */}
      {!isLoading && alertas.length > 0 && (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Alertas Estratégicos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alertas.map(alerta => (
                <AlertCard 
                  key={alerta.id} 
                  alerta={alerta} 
                  onClick={() => setAlertaSelecionado(alerta)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Chart */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                Licitações por Status
                <InfoTip text="Distribuição das licitações por status (quantidade e valor no tooltip). Ajuda a enxergar onde está o volume do pipeline e gargalos." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="label" 
                    type="category" 
                    width={100} 
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{d.label}</p>
                          <p className="text-sm">Quantidade: <span className="font-bold">{d.count}</span></p>
                          <p className="text-sm">Valor: <span className="font-bold">{formatCurrency(d.valor)}</span></p>
                          <p className="text-sm text-muted-foreground">{formatPercent(d.percentual)} do total</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getStatusColor(entry.category)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Modalidade Chart */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-semibold">Distribuição por Modalidade</CardTitle>
                  <InfoTip text="Compara modalidades por Quantidade ou Valor. 'Atual' vs 'Anterior' mostra mudança no mix do pipeline no período." />
                </div>
                <Tabs value={metricaModalidade} onValueChange={(v) => setMetricaModalidade(v as 'valor' | 'quantidade')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="quantidade" className="text-xs px-2 h-6">
                      <BarChart3 className="h-3 w-3 mr-1" />
                      Qtd
                    </TabsTrigger>
                    <TabsTrigger value="valor" className="text-xs px-2 h-6">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Valor
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={modalidadeData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => metricaModalidade === 'valor' ? formatCurrency(v) : v.toString()}
                  />
                  <YAxis 
                    dataKey="modalidade" 
                    type="category" 
                    width={120} 
                    tick={{ fontSize: 10 }}
                  />
                  <RechartsTooltip content={(props) => <ModalidadeTooltip {...props} metrica={metricaModalidade} />} />
                  <Bar 
                    dataKey={metricaModalidade === 'valor' ? 'valor' : 'quantidade'} 
                    fill="hsl(200, 80%, 50%)" 
                    radius={[0, 4, 4, 0]}
                    name="Atual"
                  />
                  <Bar 
                    dataKey={metricaModalidade === 'valor' ? 'valorAnterior' : 'quantidadeAnterior'} 
                    fill="hsl(var(--muted))" 
                    radius={[0, 4, 4, 0]}
                    name="Anterior"
                    opacity={0.4}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Evolution Chart */}
      {isLoading ? <ChartSkeleton /> : (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold">Evolução Mensal (Pipeline)</CardTitle>
                <InfoTip text="Evolução mensal de iniciadas, encerradas e ganhas. A linha tracejada separa histórico e projeção (2 meses)." />
              </div>
              <Badge variant="outline" className="text-xs">Inclui projeção de 2 meses</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={evolucaoMensal} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip content={<EvolucaoTooltip />} />
                <Legend />
                <ReferenceLine 
                  x={evolucaoMensal.find(d => d.isProjection)?.mes} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeDasharray="5 5"
                />
                <Line 
                  type="monotone" 
                  dataKey="iniciadas" 
                  name="Iniciadas"
                  stroke="hsl(200, 80%, 50%)" 
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={payload.isProjection ? 4 : 5}
                        fill={payload.isProjection ? 'transparent' : 'hsl(200, 80%, 50%)'}
                        stroke={payload.isProjection ? 'hsl(var(--muted-foreground))' : 'hsl(200, 80%, 50%)'}
                        strokeWidth={2}
                        strokeDasharray={payload.isProjection ? '3 3' : '0'}
                      />
                    );
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="encerradas" 
                  name="Encerradas"
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--muted-foreground))', r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="ganhas" 
                  name="Ganhas"
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(142, 76%, 36%)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Funnel Chart */}
      {isLoading ? <ChartSkeleton /> : (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              Funil de Conversão
              <InfoTip text="Mostra a passagem por etapas (quantidade/valor) e a % de conversão entre elas. 'Gargalo' indica onde o funil perde mais." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funilData.map((stage, index) => {
                const maxWidth = funilData[0].quantidade || 1;
                const width = Math.max(20, (stage.quantidade / maxWidth) * 100);
                
                return (
                  <div key={stage.id} className="relative">
                    <div className="flex items-center gap-3">
                      <div className="w-24 text-sm font-medium text-right">{stage.etapa}</div>
                      <div className="flex-1 relative">
                        <div 
                          className={`h-10 rounded-r-lg flex items-center px-3 transition-all ${
                            stage.isGargalo 
                              ? 'bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-700' 
                              : 'bg-primary/20'
                          }`}
                          style={{ width: `${width}%` }}
                        >
                          <span className="font-bold text-sm">{stage.quantidade}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {formatCurrency(stage.valor)}
                          </span>
                        </div>
                        {index > 0 && (
                          <div className="absolute -top-1 right-0 text-xs">
                            <span className={`font-medium ${stage.isGargalo ? 'text-red-600' : 'text-muted-foreground'}`}>
                              {formatPercent(stage.taxaEtapaAnterior)}
                            </span>
                            {stage.isGargalo && (
                              <Badge variant="destructive" className="ml-1 text-xs h-4 px-1">
                                Gargalo
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Conversão Total (Captação → Ganha):</span>
                <span className="font-bold text-lg">
                  {formatPercent(funilData[4]?.taxaConversao || 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inteligência Competitiva */}
      <InteligenciaCompetitivaSection
        modalidadeFiltro={modalidadeFiltro}
      />
      </div>

      {/* Dialog de Drill-Down dos Alertas */}
      <AlertaDrilldownDialog
        open={!!alertaSelecionado}
        onOpenChange={(open) => !open && setAlertaSelecionado(null)}
        alerta={alertaSelecionado}
        statusLabels={STATUS_LABELS}
      />
    </TooltipProvider>
  );
}
