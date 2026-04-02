import { useAgesBI360, PeriodoRapido, AlertaAges360 } from "@/hooks/useAgesBI360";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";
import { 
  TrendingUp, TrendingDown, Users, Building2, FileText, Clock, 
  Target, AlertTriangle, ShieldAlert, Lightbulb, ArrowRight, Filter,
  Activity, UserX, DollarSign, Trophy, Percent, Gavel, Info, BarChart3
} from "lucide-react";

const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { 
  style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 
}).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const COLORS = ['hsl(142, 76%, 36%)', 'hsl(200, 80%, 50%)', 'hsl(45, 93%, 47%)', 'hsl(280, 60%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(180, 60%, 45%)'];

function KPICard({ 
  title, value, subtitle, icon: Icon, variacao, variacaoLabel = "vs período anterior",
  variant = "default", isLoading, tooltip 
}: { 
  title: string; value: string | number; subtitle?: string;
  icon: React.ComponentType<{ className?: string }>; variacao?: number;
  variacaoLabel?: string; variant?: "default" | "warning" | "danger" | "success"; isLoading?: boolean;
  tooltip?: string;
}) {
  const bgClass = variant === "warning" 
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" 
    : variant === "danger" 
      ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" 
      : variant === "success"
        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
        : "bg-card border-border";
  
  const iconClass = variant === "warning" ? "text-amber-600" : variant === "danger" ? "text-red-600" 
    : variant === "success" ? "text-emerald-600" : "text-primary";

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

  const content = (
    <Card className={`shadow-md hover:shadow-lg transition-shadow ${bgClass}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        {variacao !== undefined && variacao !== 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            {variacao >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
            <span className={`text-xs font-medium ${variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {variacao >= 0 ? '+' : ''}{formatPercent(variacao)}
            </span>
            <span className="text-xs text-muted-foreground">{variacaoLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-xs"><p>{tooltip}</p></TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function AlertCard({ alerta }: { alerta: AlertaAges360 }) {
  const bgClass = alerta.tipo === 'risco' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
    : alerta.tipo === 'oportunidade' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800';
  
  const Icon = alerta.tipo === 'risco' ? ShieldAlert : alerta.tipo === 'oportunidade' ? Lightbulb : AlertTriangle;
  const iconClass = alerta.tipo === 'risco' ? 'text-red-600' : alerta.tipo === 'oportunidade' ? 'text-emerald-600' : 'text-amber-600';

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

function ChartHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger><Info className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
          <TooltipContent className="max-w-xs"><p>{tooltip}</p></TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2"><Skeleton className="h-5 w-48" /></CardHeader>
      <CardContent><Skeleton className="h-[260px] w-full" /></CardContent>
    </Card>
  );
}

const AgesRelatoriosTab = () => {
  const {
    periodoRapido, setPeriodoRapido, dataInicio, setDataInicio, dataFim, setDataFim,
    ufFiltro, setUfFiltro, clienteFiltro, setClienteFiltro, tipoContratoFiltro, setTipoContratoFiltro,
    profissaoFiltro, setProfissaoFiltro, filterOptions, isLoading,
    kpisExecutivos, kpisLicitacoes, charts, alertas
  } = useAgesBI360();

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Filtros Globais */}
        <Card className="shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Filtros</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs font-medium mb-1 block">Período</Label>
                <Select value={periodoRapido} onValueChange={(v) => setPeriodoRapido(v as PeriodoRapido)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
                <Label className="text-xs font-medium mb-1 block">UF</Label>
                <Select value={ufFiltro} onValueChange={setUfFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {filterOptions.ufs.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Cliente</Label>
                <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {filterOptions.clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Profissão</Label>
                <Select value={profissaoFiltro} onValueChange={setProfissaoFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas</SelectItem>
                    {filterOptions.profissoes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1 block">Tipo Contrato</Label>
                <Select value={tipoContratoFiltro} onValueChange={setTipoContratoFiltro}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {filterOptions.tiposContrato.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VISÃO EXECUTIVA - KPIs */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Visão Executiva
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <KPICard title="Contratos Ativos" value={kpisExecutivos.contratosAtivos} subtitle={`Licit: ${kpisExecutivos.contratosLicitacao} • Disp: ${kpisExecutivos.contratosDispensa}`} icon={FileText} isLoading={isLoading} tooltip="Total de contratos com status ativo" />
            <KPICard title="Receita Ativa" value={formatCurrency(kpisExecutivos.receitaAtivaTotal)} icon={DollarSign} variant="success" isLoading={isLoading} tooltip="Soma dos valores mensais dos contratos ativos" />
            <KPICard title="Produção Total" value={`${Math.round(kpisExecutivos.producaoTotalHoras).toLocaleString('pt-BR')}h`} icon={Clock} isLoading={isLoading} tooltip="Total de horas produzidas no período" />
            <KPICard title="Capacidade Utilizada" value={formatPercent(kpisExecutivos.capacidadeUtilizadaPerc)} icon={Activity} isLoading={isLoading} tooltip="Produção / Capacidade teórica (160h/prof/mês)" />
            <KPICard title="Receita em Risco" value={formatCurrency(kpisExecutivos.receitaEmRisco)} icon={AlertTriangle} variant={kpisExecutivos.receitaEmRisco > 0 ? "warning" : "default"} isLoading={isLoading} tooltip="Valor mensal de contratos vencendo em 60 dias" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <KPICard title="Ticket Médio" value={formatCurrency(kpisExecutivos.ticketMedio)} icon={Target} isLoading={isLoading} tooltip="Valor médio por contrato ativo" />
            <KPICard title="Dependência Licitação" value={formatPercent(kpisExecutivos.dependenciaLicitacaoPerc)} icon={Gavel} variant={kpisExecutivos.dependenciaLicitacaoPerc > 70 ? "warning" : "default"} isLoading={isLoading} tooltip="% da receita vinda de contratos de licitação" />
            <KPICard title="Risco Operacional" value={formatPercent(kpisExecutivos.riscoOperacional)} icon={ShieldAlert} variant={kpisExecutivos.riscoOperacional >= 35 ? "danger" : kpisExecutivos.riscoOperacional >= 20 ? "warning" : "success"} isLoading={isLoading} tooltip="Score baseado em pendências, baixa execução e ociosidade" />
            <KPICard title="Profissionais Ativos" value={kpisExecutivos.profissionaisAtivos} subtitle={`Ociosos: ${kpisExecutivos.profissionaisOciosos}`} icon={Users} isLoading={isLoading} />
            <KPICard title="Conversão Leads" value={formatPercent(kpisExecutivos.taxaConversaoLeads)} subtitle={`${kpisExecutivos.leadsConvertidos}/${kpisExecutivos.leadsTotal}`} icon={Percent} isLoading={isLoading} />
          </div>
        </div>

        {/* KPIs LICITAÇÕES/COMPETITIVIDADE */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Licitações & Competitividade AGES
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KPICard title="Licitações AGES" value={kpisLicitacoes.licitacoesTotal} subtitle={`Em disputa: ${kpisLicitacoes.licitacoesEmDisputa}`} icon={Gavel} isLoading={isLoading} />
            <KPICard title="Ganhas" value={kpisLicitacoes.licitacoesGanhas} icon={Trophy} variant="success" isLoading={isLoading} />
            <KPICard title="Taxa Conversão" value={formatPercent(kpisLicitacoes.taxaConversaoLicitacoes)} subtitle={`Perdidas: ${kpisLicitacoes.licitacoesPerdidas}`} icon={Percent} variant={kpisLicitacoes.taxaConversaoLicitacoes >= 30 ? "success" : kpisLicitacoes.taxaConversaoLicitacoes >= 15 ? "default" : "danger"} isLoading={isLoading} />
            <KPICard title="Valor Pipeline" value={formatCurrency(kpisLicitacoes.valorPipeline)} icon={DollarSign} isLoading={isLoading} />
            <KPICard title="Ranking Médio" value={kpisLicitacoes.rankingMedio > 0 ? `${kpisLicitacoes.rankingMedio.toFixed(1)}º` : '—'} icon={BarChart3} variant={kpisLicitacoes.rankingMedio <= 2 ? "success" : kpisLicitacoes.rankingMedio <= 3 ? "default" : "warning"} isLoading={isLoading} tooltip="Posição média da GSS nos itens licitados" />
            <KPICard title="Taxa Vitória Itens" value={formatPercent(kpisLicitacoes.taxaVitoriaItens)} subtitle={`${kpisLicitacoes.vitoriasGSS}/${kpisLicitacoes.participacoesGSS} itens`} icon={Trophy} isLoading={isLoading} />
          </div>
        </div>

        {/* ALERTAS ESTRATÉGICOS */}
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
                {alertas.map(a => <AlertCard key={a.id} alerta={a} />)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* VISÃO ANALÍTICA - GRÁFICOS */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" /> Visão Analítica
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Produção por Profissional */}
            {isLoading ? <ChartSkeleton /> : (
              <Card className="shadow-md">
                <CardHeader className="pb-2"><ChartHeader title="Produção por Profissional (Top 10)" tooltip="Horas produzidas por profissional no período" /></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={charts.producaoPorProfissional} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(v: any) => [`${v}h`, 'Horas']} />
                      <Bar dataKey="horas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Produção por Cliente */}
            {isLoading ? <ChartSkeleton /> : (
              <Card className="shadow-md">
                <CardHeader className="pb-2"><ChartHeader title="Produção por Cliente (Top 10)" tooltip="Horas produzidas por cliente no período" /></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={charts.producaoPorCliente} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(v: any) => [`${v}h`, 'Horas']} />
                      <Bar dataKey="horas" fill="hsl(var(--secondary-foreground))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Receita por Tipo de Contrato */}
            {isLoading ? <ChartSkeleton /> : (
              <Card className="shadow-md">
                <CardHeader className="pb-2"><ChartHeader title="Receita por Tipo de Contrato" /></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={charts.receitaPorTipoData} dataKey="valor" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={({ tipo, percent }) => `${tipo}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {charts.receitaPorTipoData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip formatter={(v: any) => [formatCurrency(v), 'Valor']} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Evolução da Produção */}
            {isLoading ? <ChartSkeleton /> : (
              <Card className="shadow-md">
                <CardHeader className="pb-2"><ChartHeader title="Evolução da Produção (12 meses)" /></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={charts.evolucaoProducaoData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <RechartsTooltip formatter={(v: any) => [`${v}h`, 'Horas']} />
                      <Bar dataKey="horas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Competitividade AGES */}
          {charts.rankingPorTipoData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isLoading ? <ChartSkeleton /> : (
                <Card className="shadow-md">
                  <CardHeader className="pb-2"><ChartHeader title="Ranking GSS por Tipo de Item" tooltip="Posição média da GSS em cada tipo de item licitado" /></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={charts.rankingPorTipoData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 'auto']} />
                        <RechartsTooltip formatter={(v: any) => [`${Number(v).toFixed(1)}º`, 'Ranking']} />
                        <Bar dataKey="ranking" fill="hsl(45, 93%, 47%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {isLoading ? <ChartSkeleton /> : (
                <Card className="shadow-md">
                  <CardHeader className="pb-2"><ChartHeader title="Taxa de Vitória por Tipo de Item" /></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={charts.taxaVitoriaPorTipoData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="vitorias" name="Vitórias" fill="hsl(142, 76%, 36%)" stackId="a" />
                        <Bar dataKey="perdas" name="Perdas" fill="hsl(0, 84%, 60%)" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Top Concorrentes */}
          {charts.topConcorrentes.length > 0 && (
            <Card className="shadow-md">
              <CardHeader className="pb-2"><ChartHeader title="Principais Concorrentes AGES" tooltip="Empresas que mais vencem disputas contra a GSS em licitações AGES" /></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={charts.topConcorrentes} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="vitorias" name="Vitórias contra GSS" fill="hsl(0, 84%, 60%)" />
                    <Bar dataKey="disputas" name="Disputas" fill="hsl(200, 80%, 50%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default AgesRelatoriosTab;
