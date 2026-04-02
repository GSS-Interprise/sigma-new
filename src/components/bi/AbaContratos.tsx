import { useContratosBI, PeriodoRapido, AlertaEstrategico } from "@/hooks/useContratosBI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell, Legend
} from "recharts";
import { 
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, 
  AlertCircle, Calendar, Building2, Filter, Trophy, ShieldAlert,
  Target, XCircle, Lightbulb, ArrowRight, PieChart, BarChart3
} from "lucide-react";
import { format, parseISO } from "date-fns";
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

// KPI Card Component
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
        {variacao !== undefined && (
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

// Loading skeleton for charts
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

// Alert Card Component
function AlertCard({ alerta }: { alerta: AlertaEstrategico }) {
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
    <div className={`p-3 rounded-lg border ${bgClass}`}>
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
        </div>
      </div>
    </div>
  );
}

// Custom tooltip for evolution chart
function EvolucaoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-base">{label}</p>
      <div className="space-y-1 mt-2">
        <p className="text-sm">
          <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-2" />
          Ativos: <span className="font-bold">{data.ativos}</span>
        </p>
        {!data.isProjection && (
          <>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2" />
              Encerrados: <span className="font-bold">{data.encerrados}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Valor Total: <span className="font-medium">{formatCurrency(data.valorTotal)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Ticket Médio: <span className="font-medium">{formatCurrency(data.ticketMedio)}</span>
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

// Custom tooltip for service type chart
function TipoServicoTooltip({ active, payload, metrica }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg min-w-[200px]">
      <p className="font-semibold text-base">{data.tipo}</p>
      <div className="space-y-1 mt-2">
        {metrica === 'valor' ? (
          <>
            <p className="text-sm">Valor Atual: <span className="font-bold">{formatCurrency(data.valor)}</span></p>
            <p className="text-sm text-muted-foreground">Período Anterior: {formatCurrency(data.valorAnterior)}</p>
            {data.variacaoValor !== 0 && (
              <p className={`text-sm ${data.variacaoValor >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.variacaoValor >= 0 ? '↑' : '↓'} {Math.abs(data.variacaoValor).toFixed(1)}%
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm">Quantidade Atual: <span className="font-bold">{data.quantidade}</span></p>
            <p className="text-sm text-muted-foreground">Período Anterior: {data.quantidadeAnterior}</p>
            {data.variacaoQtd !== 0 && (
              <p className={`text-sm ${data.variacaoQtd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.variacaoQtd >= 0 ? '↑' : '↓'} {Math.abs(data.variacaoQtd).toFixed(1)}%
              </p>
            )}
          </>
        )}
        <p className="text-sm text-muted-foreground">{formatPercent(metrica === 'valor' ? data.percentual : data.percentualQtd)} do total</p>
      </div>
    </div>
  );
}

// Status colors
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Ativo': return 'hsl(142, 76%, 36%)';
    case 'Inativo': return 'hsl(220, 14%, 50%)';
    case 'Encerrado': return 'hsl(0, 84%, 60%)';
    case 'Suspenso': return 'hsl(45, 93%, 47%)';
    case 'Em Renovação': return 'hsl(200, 80%, 50%)';
    case 'Vencido': return 'hsl(0, 60%, 40%)';
    case 'Pre-Contrato': return 'hsl(280, 60%, 50%)';
    default: return 'hsl(var(--muted))';
  }
};

export function AbaContratos() {
  const {
    periodoRapido,
    setPeriodoRapido,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    tipoServicoFiltro,
    setTipoServicoFiltro,
    clienteFiltro,
    setClienteFiltro,
    statusFiltro,
    setStatusFiltro,
    faixaValorFiltro,
    setFaixaValorFiltro,
    somenteAtivos,
    setSomenteAtivos,
    metricaTipoServico,
    setMetricaTipoServico,
    filterOptions,
    isLoading,
    kpis,
    tipoServicoData,
    statusData,
    evolucaoMensal,
    contratosVencer,
    topContratos,
    alertas
  } = useContratosBI();

  return (
    <TooltipProvider>
      <div className="space-y-4">
      {/* Smart Filters */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filtros</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="somente-ativos"
                checked={somenteAtivos}
                onCheckedChange={setSomenteAtivos}
              />
              <Label htmlFor="somente-ativos" className="text-sm cursor-pointer">
                Somente Ativos
              </Label>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
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
                  <Input
                    type="date"
                    className="h-9"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1 block">Data Fim</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
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
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs font-medium mb-1 block">Tipo de Serviço</Label>
              <Select value={tipoServicoFiltro} onValueChange={setTipoServicoFiltro}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.tiposServico.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs font-medium mb-1 block">Cliente</Label>
              <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {filterOptions.clientes.map(cliente => (
                    <SelectItem key={cliente} value={cliente}>{cliente}</SelectItem>
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
                  <SelectItem value="ate_10k">Até R$ 10 mil</SelectItem>
                  <SelectItem value="10k_50k">R$ 10 - 50 mil</SelectItem>
                  <SelectItem value="50k_100k">R$ 50 - 100 mil</SelectItem>
                  <SelectItem value="100k_500k">R$ 100 - 500 mil</SelectItem>
                  <SelectItem value="acima_500k">Acima de R$ 500 mil</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs - 2 rows of 4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="Contratos Ativos"
          value={formatCurrency(kpis.valorAtivos)}
          subtitle={`${kpis.totalAtivos} contratos`}
          icon={DollarSign}
          variacao={kpis.variacaoValor}
          variant="success"
          isLoading={isLoading}
        />
        <KPICard
          title="Contratos Inativos"
          value={formatCurrency(kpis.valorInativos)}
          icon={XCircle}
          isLoading={isLoading}
        />
        <KPICard
          title="Valor em Risco"
          value={formatCurrency(kpis.valorEmRisco)}
          subtitle={`${kpis.qtdEmRisco} contratos (vencidos + a vencer)`}
          icon={ShieldAlert}
          variant="danger"
          isLoading={isLoading}
        />
        <KPICard
          title="Ticket Médio"
          value={formatCurrency(kpis.ticketMedio)}
          icon={Target}
          variacao={kpis.variacaoTicket}
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          title="A Vencer (30 dias)"
          value={`${kpis.qtdVencer30}`}
          subtitle={formatCurrency(kpis.valorVencer30)}
          icon={Calendar}
          variant="warning"
          isLoading={isLoading}
        />
        <KPICard
          title="Vencidos"
          value={`${kpis.qtdVencidos}`}
          subtitle={formatCurrency(kpis.valorVencido)}
          icon={AlertCircle}
          variant="danger"
          isLoading={isLoading}
        />
        <KPICard
          title="Encerrados no Período"
          value={kpis.totalEncerradosPeriodo}
          subtitle="Churn contratual"
          icon={TrendingDown}
          isLoading={isLoading}
        />
        <KPICard
          title="Concentração Top 3"
          value={formatPercent(kpis.concentracaoTop3)}
          subtitle="do faturamento total"
          icon={PieChart}
          variant={kpis.concentracaoTop3 > 50 ? "warning" : "default"}
          isLoading={isLoading}
        />
      </div>

      {/* Alertas Estratégicos */}
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
                <AlertCard key={alerta.id} alerta={alerta} />
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
                Contratos por Status
                <InfoTip text="Distribuição da carteira por status (quantidade e valor). Use para entender o mix e identificar risco (vencidos/suspensos/em renovação)." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => v.toString()} />
                  <YAxis 
                    dataKey="status" 
                    type="category" 
                    width={100} 
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold">{d.status}</p>
                          <p className="text-sm">Quantidade: <span className="font-bold">{d.count}</span></p>
                          <p className="text-sm">Valor: <span className="font-bold">{formatCurrency(d.valor)}</span></p>
                          <p className="text-sm text-muted-foreground">{formatPercent(d.percentual)} do total</p>
                          {d.variacao !== 0 && (
                            <p className={`text-sm ${d.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {d.variacao >= 0 ? '↑' : '↓'} {Math.abs(d.variacao).toFixed(0)}% vs anterior
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statusData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={getStatusColor(entry.status)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Service Type - with toggle */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg font-semibold">Distribuição por Tipo de Serviço</CardTitle>
                  <InfoTip text="Compara os tipos de serviço por Valor ou Quantidade. 'Atual' é o período selecionado; 'Anterior' é o período anterior equivalente." />
                </div>
                <Tabs value={metricaTipoServico} onValueChange={(v) => setMetricaTipoServico(v as 'valor' | 'quantidade')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="valor" className="text-xs px-2 h-6">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Valor
                    </TabsTrigger>
                    <TabsTrigger value="quantidade" className="text-xs px-2 h-6">
                      <BarChart3 className="h-3 w-3 mr-1" />
                      Qtd
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={tipoServicoData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => metricaTipoServico === 'valor' ? formatCurrency(v) : v.toString()}
                  />
                  <YAxis 
                    dataKey="tipo" 
                    type="category" 
                    width={120} 
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip content={(props) => <TipoServicoTooltip {...props} metrica={metricaTipoServico} />} />
                  <Bar 
                    dataKey={metricaTipoServico === 'valor' ? 'valor' : 'quantidade'} 
                    fill="hsl(142, 76%, 36%)" 
                    radius={[0, 4, 4, 0]}
                    name="Atual"
                  >
                    {tipoServicoData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={`hsl(142, ${76 - index * 8}%, ${36 + index * 5}%)`}
                      />
                    ))}
                  </Bar>
                  <Bar 
                    dataKey={metricaTipoServico === 'valor' ? 'valorAnterior' : 'quantidadeAnterior'} 
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

      {/* Evolution Chart - Full Width */}
      {isLoading ? <ChartSkeleton /> : (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold">Evolução de Contratos</CardTitle>
                <InfoTip text="Evolução mensal de contratos ativos e encerrados. A linha tracejada separa histórico e projeção (2 meses)." />
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
                  dataKey="ativos" 
                  name="Ativos"
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={payload.isProjection ? 4 : 5}
                        fill={payload.isProjection ? 'transparent' : 'hsl(142, 76%, 36%)'}
                        stroke={payload.isProjection ? 'hsl(var(--muted-foreground))' : 'hsl(142, 76%, 36%)'}
                        strokeWidth={2}
                        strokeDasharray={payload.isProjection ? '3 3' : '0'}
                      />
                    );
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="encerrados" 
                  name="Encerrados"
                  stroke="hsl(0, 84%, 60%)" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(0, 84%, 60%)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contracts About to Expire */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  Contratos Prestes a Vencer
                  <InfoTip text="Lista de contratos com vencimento próximo (prazo e valor). Priorize críticos/alerta para reduzir risco de perda de receita." />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {contratosVencer.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum contrato a vencer nos próximos 60 dias
                  </p>
                ) : (
                  contratosVencer.map((contrato) => (
                    <div 
                      key={contrato.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        contrato.urgencia === 'critico' 
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' 
                          : contrato.urgencia === 'alerta'
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                            : 'bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{contrato.cliente}</p>
                        <p className="text-xs text-muted-foreground">
                          Vence em {format(parseISO(contrato.dataFim), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="font-semibold text-sm">{formatCurrency(contrato.valor)}</p>
                        <p className="text-xs text-muted-foreground">{formatPercent(contrato.percentual)}</p>
                      </div>
                      <Badge 
                        variant={contrato.urgencia === 'critico' ? 'destructive' : contrato.urgencia === 'alerta' ? 'secondary' : 'outline'}
                        className="ml-2 text-xs"
                      >
                        {contrato.diasRestantes}d
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Contracts by Value */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  Top Contratos por Valor
                  <InfoTip text="Ranking dos contratos com maior peso financeiro. Use para entender concentração e impacto de churn/renovação." />
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {topContratos.map((contrato) => (
                  <div 
                    key={contrato.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      contrato.isInativo 
                        ? 'bg-red-50/50 dark:bg-red-950/10 border-red-200/50 dark:border-red-800/50' 
                        : 'bg-muted/30 border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                      contrato.posicao === 1 ? 'bg-amber-500 text-white' :
                      contrato.posicao === 2 ? 'bg-slate-400 text-white' :
                      contrato.posicao === 3 ? 'bg-amber-700 text-white' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {contrato.posicao}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{contrato.cliente}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {contrato.codigo ? `#${contrato.codigo}` : 'S/N'}
                        </span>
                        <Badge 
                          variant={contrato.isInativo ? 'destructive' : 'secondary'} 
                          className="text-xs h-5"
                        >
                          {contrato.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${contrato.isInativo ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(contrato.valor)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPercent(contrato.percentualTotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </TooltipProvider>
  );
}
