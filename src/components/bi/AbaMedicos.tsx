import { useMedicosBI, PeriodoRapido, FiltroRapido } from "@/hooks/useMedicosBI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell, Legend
} from "recharts";
import { 
  TrendingUp, TrendingDown, Users, UserCheck, UserPlus, UserMinus,
  FileWarning, AlertTriangle, Shield, Filter, MapPin, Stethoscope,
  ClipboardCheck, Clock, CheckCircle2, XCircle, HelpCircle, AlertCircle,
  Info, Zap, Target, Activity
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

// KPI Card Component
function KPICard({ 
  title, 
  value, 
  icon: Icon, 
  variacao, 
  variacaoLabel = "vs período anterior",
  variant = "default",
  subtitle,
  isLoading 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ComponentType<{ className?: string }>;
  variacao?: number;
  variacaoLabel?: string;
  variant?: "default" | "warning" | "danger" | "success";
  subtitle?: string;
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
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`shadow-md hover:shadow-lg transition-shadow ${bgClass}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
        {variacao !== undefined && (
          <div className="flex items-center gap-1 mt-1.5">
            {variacao >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-600" />
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
function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card className={`shadow-md ${className}`}>
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
function AlertCard({ tipo, titulo, descricao }: { 
  tipo: 'critico' | 'alerta' | 'atencao' | 'oportunidade'; 
  titulo: string; 
  descricao: string 
}) {
  const config = {
    critico: { 
      bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', 
      icon: AlertCircle, 
      iconColor: 'text-red-600',
      badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    },
    alerta: { 
      bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800', 
      icon: AlertTriangle, 
      iconColor: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    },
    atencao: { 
      bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800', 
      icon: Info, 
      iconColor: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    },
    oportunidade: { 
      bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800', 
      icon: Zap, 
      iconColor: 'text-emerald-600',
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    }
  };

  const { bg, icon: Icon, iconColor, badge } = config[tipo];

  return (
    <div className={`p-3 rounded-lg border ${bg}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 ${iconColor} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{titulo}</span>
            <Badge className={`text-[10px] px-1.5 py-0 ${badge}`}>
              {tipo === 'critico' ? 'Crítico' : tipo === 'alerta' ? 'Alerta' : tipo === 'atencao' ? 'Atenção' : 'Oportunidade'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
    </div>
  );
}

// Status icon component
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'Aprovados':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'Pendentes':
      return <Clock className="h-4 w-4 text-amber-600" />;
    case 'Reprovados':
      return <XCircle className="h-4 w-4 text-red-600" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

// Custom tooltip for evolution chart
function EvolucaoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-base mb-1">{label}</p>
      <div className="space-y-1 text-sm">
        <p>Cadastrados: <span className="font-bold">{data.cadastrados}</span></p>
        <p className="text-emerald-600">Aprovados: <span className="font-bold">{data.aprovados}</span></p>
        <p className="text-red-600">Bloqueados: <span className="font-bold">{data.bloqueados}</span></p>
        <p className="text-muted-foreground">
          Taxa aprovação: <span className="font-medium">{formatPercent(data.taxaAprovacao)}</span>
        </p>
        <p className="text-primary">
          Impacto em ativos: <span className="font-bold">+{data.impactoAtivos}</span>
        </p>
      </div>
      {data.isProjection && (
        <Badge variant="secondary" className="mt-2">Projeção</Badge>
      )}
    </div>
  );
}

// Custom tooltip for specialty chart
function EspecialidadeTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-base">{data.especialidade}</p>
      <p className="text-sm">Total: <span className="font-bold">{data.total}</span></p>
      <p className="text-sm text-emerald-600">Ativos: <span className="font-bold">{data.ativos}</span></p>
      <p className="text-sm text-muted-foreground">{formatPercent(data.percentual)} do total</p>
      {data.variacao !== 0 && (
        <p className={`text-sm ${data.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {data.variacao >= 0 ? '↑' : '↓'} {Math.abs(data.variacao).toFixed(0)}% vs período anterior
        </p>
      )}
      {data.isDeficit && (
        <Badge variant="destructive" className="mt-1 text-xs">Em Déficit</Badge>
      )}
    </div>
  );
}

// Custom tooltip for region chart
function RegiaoTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="font-semibold text-base">{data.nome} ({data.uf})</p>
      <p className="text-sm">Total: <span className="font-bold">{data.total}</span></p>
      <p className="text-sm text-emerald-600">Ativos: <span className="font-bold">{data.ativos}</span></p>
      <p className="text-sm text-muted-foreground">{formatPercent(data.percentual)} do total</p>
      {data.isCritico && (
        <Badge variant="destructive" className="mt-1 text-xs">Cobertura Crítica</Badge>
      )}
      {data.isBaixo && !data.isCritico && (
        <Badge variant="outline" className="mt-1 text-xs border-amber-500 text-amber-600">Baixa Cobertura</Badge>
      )}
    </div>
  );
}

export function AbaMedicos() {
  const {
    periodoRapido,
    setPeriodoRapido,
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
    isLoading,
    kpis,
    regiaoData,
    especialidadeData,
    statusCadastroData,
    riscosOperacionais,
    evolucaoMensal,
    alertas
  } = useMedicosBI();

  return (
    <div className="space-y-5">
      {/* Smart Filters */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filtros</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="apenas-aptos" className="text-xs text-muted-foreground">
                Apenas médicos aptos
              </Label>
              <Switch 
                id="apenas-aptos"
                checked={mostrarApenasAptos}
                onCheckedChange={setMostrarApenasAptos}
              />
            </div>
          </div>
          
          {/* Quick Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { value: 'todos' as FiltroRapido, label: 'Todos' },
              { value: 'ativos' as FiltroRapido, label: 'Ativos' },
              { value: 'com_pendencia' as FiltroRapido, label: 'Com Pendência' },
              { value: 'inativos' as FiltroRapido, label: 'Inativos' },
            ].map(f => (
              <Badge
                key={f.value}
                variant={filtroRapido === f.value ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/80 transition-colors"
                onClick={() => setFiltroRapido(f.value)}
              >
                {f.label}
              </Badge>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Período</Label>
              <Select value={periodoRapido} onValueChange={(v) => setPeriodoRapido(v as PeriodoRapido)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="trimestre">Último Trimestre</SelectItem>
                  <SelectItem value="semestre">Último Semestre</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {periodoRapido === "personalizado" && (
              <>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Data Início</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">Data Fim</Label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
              </>
            )}
            
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Região (UF)</Label>
              <Select value={ufFiltro} onValueChange={setUfFiltro}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.ufs.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Especialidade</Label>
              <Select value={especialidadeFiltro} onValueChange={setEspecialidadeFiltro}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filterOptions.especialidades.map(esp => (
                    <SelectItem key={esp} value={esp}>{esp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Status</Label>
              <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Suspenso">Suspenso</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Médicos Aptos"
          value={kpis.medicosAptos}
          icon={UserCheck}
          variacao={kpis.variacaoAptos}
          subtitle="Ativos + doc. aprovada"
          variant="success"
          isLoading={isLoading}
        />
        <KPICard
          title="Total Cadastrados"
          value={kpis.totalCadastrados}
          icon={Users}
          isLoading={isLoading}
        />
        <KPICard
          title="Novos no Período"
          value={kpis.novosNoPeriodo}
          icon={UserPlus}
          variacao={kpis.variacaoNovos}
          isLoading={isLoading}
        />
        <KPICard
          title="Crescimento Líquido"
          value={kpis.crescimentoLiquido >= 0 ? `+${kpis.crescimentoLiquido}` : kpis.crescimentoLiquido.toString()}
          icon={kpis.crescimentoLiquido >= 0 ? TrendingUp : TrendingDown}
          variacao={kpis.variacaoCrescimento}
          subtitle="Entradas - saídas"
          variant={kpis.crescimentoLiquido >= 0 ? "success" : "danger"}
          isLoading={isLoading}
        />
      </div>

      {/* KPIs de Risco */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="Pendência de Documentação"
          value={kpis.comPendenciaDoc}
          icon={FileWarning}
          variant={kpis.comPendenciaDoc > 10 ? "danger" : kpis.comPendenciaDoc > 5 ? "warning" : "default"}
          subtitle="Não podem atender"
          isLoading={isLoading}
        />
        <KPICard
          title="Especialidades em Déficit"
          value={kpis.especialidadesDeficit}
          icon={Stethoscope}
          variant={kpis.especialidadesDeficit > 5 ? "danger" : kpis.especialidadesDeficit > 2 ? "warning" : "default"}
          subtitle="< 3 médicos ativos"
          isLoading={isLoading}
        />
        <KPICard
          title="Inativos/Bloqueados"
          value={kpis.medicosInativos}
          icon={UserMinus}
          variant={kpis.medicosInativos > 15 ? "danger" : kpis.medicosInativos > 8 ? "warning" : "default"}
          isLoading={isLoading}
        />
      </div>

      {/* Charts Row 1 - Status de Cadastro + Riscos Operacionais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Status de Cadastro */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-semibold">Status de Cadastro</CardTitle>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        <strong>Aptos:</strong> {formatPercent(statusCadastroData.aptosPercentual)}<br/>
                        <strong>Não aptos:</strong> {formatPercent(statusCadastroData.naoAptosPercentual)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {/* Barra de progresso Aptos vs Não Aptos */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Aptos: {formatPercent(statusCadastroData.aptosPercentual)}</span>
                  <span>Não aptos: {formatPercent(statusCadastroData.naoAptosPercentual)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                  <div 
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${statusCadastroData.aptosPercentual}%` }}
                  />
                  <div 
                    className="bg-amber-500 h-full transition-all"
                    style={{ width: `${statusCadastroData.naoAptosPercentual}%` }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statusCadastroData.lista.map((item) => (
                  <TooltipProvider key={item.status}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors cursor-help">
                          <div className="flex items-center gap-2">
                            <StatusIcon status={item.status} />
                            <span className="font-medium text-sm">{item.status}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold">{item.quantidade}</span>
                            <Badge variant="outline" className="text-xs">
                              {formatPercent(item.percentual)}
                            </Badge>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{item.impacto}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Riscos Operacionais */}
        {isLoading ? <ChartSkeleton className="lg:col-span-2" /> : (
          <Card className="shadow-md lg:col-span-2 border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2 bg-amber-50/50 dark:bg-amber-950/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg font-semibold">Riscos Operacionais</CardTitle>
                </div>
                {riscosOperacionais.impedemAtendimento > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {riscosOperacionais.impedemAtendimento} impedem atendimento
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Cards de risco */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className={`p-3 rounded-lg border ${riscosOperacionais.cadastroPendente > 5 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200' : 'bg-muted/30 border-border'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileWarning className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs font-medium">Cadastro Pendente</span>
                  </div>
                  <p className="text-xl font-bold">{riscosOperacionais.cadastroPendente}</p>
                </div>
                
                <div className={`p-3 rounded-lg border ${riscosOperacionais.docs30 > 3 ? 'bg-red-50 dark:bg-red-950/20 border-red-200' : 'bg-muted/30 border-border'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-xs font-medium">Docs Exp. 30d</span>
                  </div>
                  <p className="text-xl font-bold">{riscosOperacionais.docs30}</p>
                </div>
                
                <div className={`p-3 rounded-lg border ${riscosOperacionais.docs60 > 5 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200' : 'bg-muted/30 border-border'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs font-medium">Docs Exp. 60d</span>
                  </div>
                  <p className="text-xl font-bold">{riscosOperacionais.docs60}</p>
                </div>
                
                <div className={`p-3 rounded-lg border bg-muted/30 border-border`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Docs Exp. 90d</span>
                  </div>
                  <p className="text-xl font-bold">{riscosOperacionais.docs90}</p>
                </div>
              </div>
              
              {/* Lista de documentos expirando */}
              {riscosOperacionais.docsExpirandoLista.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Documentos próximos do vencimento:</p>
                  <div className="grid grid-cols-2 gap-2 max-h-[100px] overflow-y-auto">
                    {riscosOperacionais.docsExpirandoLista.map((doc) => (
                      <div 
                        key={doc.id}
                        className={`flex items-center justify-between p-2 rounded text-xs ${
                          doc.diasRestantes < 15 
                            ? 'bg-red-100 dark:bg-red-950/30' 
                            : 'bg-amber-100 dark:bg-amber-950/30'
                        }`}
                      >
                        <span className="truncate flex-1">{doc.tipoDocumento}</span>
                        <Badge variant={doc.diasRestantes < 15 ? "destructive" : "secondary"} className="text-[10px] ml-1">
                          {doc.diasRestantes}d
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Especialidades em déficit */}
              {riscosOperacionais.especialidadesDeficit.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Especialidades em déficit:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {riscosOperacionais.especialidadesDeficit.map((esp) => (
                      <Badge 
                        key={esp.especialidade}
                        variant={esp.ativos === 0 ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {esp.especialidade}: {esp.ativos} ativo(s)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Row 2 - Região + Especialidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distribuição por Região */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-semibold">Distribuição por Região</CardTitle>
                </div>
                {regiaoData.filter(r => r.isCritico).length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {regiaoData.filter(r => r.isCritico).length} regiões críticas
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={regiaoData.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="uf" 
                    type="category" 
                    width={50} 
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip content={<RegiaoTooltip />} />
                  <Bar dataKey="ativos" name="Ativos" stackId="a" fill="hsl(142, 76%, 36%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                    {regiaoData.slice(0, 10).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.isCritico 
                          ? 'hsl(0, 84%, 60%)' 
                          : entry.isBaixo 
                            ? 'hsl(45, 93%, 47%)' 
                            : `hsl(210, ${70 - index * 5}%, ${45 + index * 3}%)`
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Médicos por Especialidade */}
        {isLoading ? <ChartSkeleton /> : (
          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-semibold">Médicos por Especialidade</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Nomes normalizados • Barras vermelhas = déficit</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={especialidadeData.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="especialidade" 
                    type="category" 
                    width={110} 
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip content={<EspecialidadeTooltip />} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {especialidadeData.slice(0, 10).map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.especialidade === 'Outros' 
                          ? 'hsl(var(--muted-foreground))' 
                          : entry.isDeficit
                            ? 'hsl(0, 84%, 60%)'
                            : `hsl(142, ${76 - index * 6}%, ${36 + index * 3}%)`
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Alertas Inteligentes */}
      {alertas.length > 0 && (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Alertas Inteligentes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alertas.map((alerta, idx) => (
                <AlertCard 
                  key={idx}
                  tipo={alerta.tipo}
                  titulo={alerta.titulo}
                  descricao={alerta.descricao}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evolution Chart - Full Width */}
      {isLoading ? <ChartSkeleton /> : (
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-semibold">Evolução de Cadastros</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">Inclui projeção de 2 meses</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Cadastrados vs Aprovados vs Bloqueados</p>
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
                  label={{ value: 'Projeção', position: 'top', fontSize: 10 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="cadastrados" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  name="Cadastrados"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={payload.isProjection ? 3 : 4}
                        fill={payload.isProjection ? 'transparent' : 'hsl(var(--primary))'}
                        stroke={payload.isProjection ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))'}
                        strokeWidth={2}
                        strokeDasharray={payload.isProjection ? '3 3' : '0'}
                      />
                    );
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="aprovados" 
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                  name="Aprovados"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={payload.isProjection ? 3 : 4}
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
                  dataKey="bloqueados" 
                  stroke="hsl(0, 84%, 60%)" 
                  strokeWidth={2}
                  name="Bloqueados"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <circle 
                        cx={cx} 
                        cy={cy} 
                        r={payload.isProjection ? 3 : 4}
                        fill={payload.isProjection ? 'transparent' : 'hsl(0, 84%, 60%)'}
                        stroke={payload.isProjection ? 'hsl(var(--muted-foreground))' : 'hsl(0, 84%, 60%)'}
                        strokeWidth={2}
                        strokeDasharray={payload.isProjection ? '3 3' : '0'}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
