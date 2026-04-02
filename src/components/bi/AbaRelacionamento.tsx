import { useState } from "react";
import { useRelacionamentoBI } from "@/hooks/useRelacionamentoBI";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList
} from "recharts";
import { 
  MessageSquare, AlertTriangle, CheckCircle2, Clock, Users, TrendingUp, TrendingDown, 
  AlertCircle, ExternalLink, Filter, RotateCcw, UserX, Activity, XCircle,
  ThumbsUp, Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AbaRelacionamento() {
  const {
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    filters,
    setFilters,
    isLoading,
    dadosFiltrados,
    kpis,
    tipoData,
    funilData,
    statusSlaData,
    evolucaoMensal,
    alertas,
    tiposUnicos,
    medicosUnicos,
    SLA_DIAS,
  } = useRelacionamentoBI();

  const [evolucaoMetrica, setEvolucaoMetrica] = useState<'total' | 'reclamacoes' | 'atraso' | 'reincidentes'>('total');
  const [showFilters, setShowFilters] = useState(false);

  const resetFilters = () => {
    setFilters({
      tipoInteracao: "",
      status: "",
      medicoId: "",
      slaStatus: "",
      apenasReclamacoes: false,
      apenasReincidencias: false,
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "" && v !== false);

  // Componente de variação
  const VariacaoIndicator = ({ valor, invertido = false }: { valor: number; invertido?: boolean }) => {
    if (valor === 0) return <span className="text-xs text-muted-foreground flex items-center gap-1"><Minus className="h-3 w-3" /> 0%</span>;
    
    const positivo = invertido ? valor < 0 : valor > 0;
    const Icon = positivo ? TrendingUp : TrendingDown;
    
    return (
      <span className={cn(
        "text-xs flex items-center gap-1",
        positivo ? "text-emerald-600" : "text-red-600"
      )}>
        <Icon className="h-3 w-3" />
        {valor > 0 ? "+" : ""}{valor.toFixed(1)}%
      </span>
    );
  };

  // KPI Card
  const KPICard = ({ 
    titulo, valor, anterior, variacao, icon: Icon, tipo = 'default', invertido = false, descricao 
  }: {
    titulo: string;
    valor: number;
    anterior?: number;
    variacao?: number;
    icon: any;
    tipo?: 'default' | 'success' | 'warning' | 'danger';
    invertido?: boolean;
    descricao?: string;
  }) => {
    const cores = {
      default: 'bg-card border',
      success: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
      warning: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
      danger: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900'
    };
    
    const iconCores = {
      default: 'text-primary',
      success: 'text-emerald-600',
      warning: 'text-amber-600',
      danger: 'text-red-600'
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={cn("cursor-help transition-shadow hover:shadow-md", cores[tipo])}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
                    <p className="text-2xl font-bold">{valor}</p>
                    {variacao !== undefined && <VariacaoIndicator valor={variacao} invertido={invertido} />}
                  </div>
                  <Icon className={cn("h-5 w-5", iconCores[tipo])} />
                </div>
              </CardContent>
            </Card>
          </TooltipTrigger>
          {descricao && (
            <TooltipContent>
              <p className="max-w-xs">{descricao}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onDataInicioChange={setDataInicio}
          onDataFimChange={setDataFim}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <FiltroPeriodo
            dataInicio={dataInicio}
            dataFim={dataFim}
            onDataInicioChange={setDataInicio}
            onDataFimChange={setDataFim}
          />
          
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">!</Badge>}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Painel de filtros expandido */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Interação</Label>
                  <Select
                    value={filters.tipoInteracao}
                    onValueChange={(v) => setFilters(f => ({ ...f, tipoInteracao: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {tiposUnicos.map(tipo => (
                        <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(v) => setFilters(f => ({ ...f, status: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="aberta">Aberta</SelectItem>
                      <SelectItem value="em_analise">Em Análise</SelectItem>
                      <SelectItem value="em_progresso">Em Progresso</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Médico</Label>
                  <Select
                    value={filters.medicoId}
                    onValueChange={(v) => setFilters(f => ({ ...f, medicoId: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {medicosUnicos.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">SLA</Label>
                  <Select
                    value={filters.slaStatus}
                    onValueChange={(v) => setFilters(f => ({ ...f, slaStatus: v === 'all' ? '' : v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="no_prazo">No Prazo</SelectItem>
                      <SelectItem value="atrasado">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="reclamacoes"
                      checked={filters.apenasReclamacoes}
                      onCheckedChange={(v) => setFilters(f => ({ ...f, apenasReclamacoes: v }))}
                    />
                    <Label htmlFor="reclamacoes" className="text-xs">Só Reclamações</Label>
                  </div>
                </div>

                <div className="flex items-end gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="reincidencias"
                      checked={filters.apenasReincidencias}
                      onCheckedChange={(v) => setFilters(f => ({ ...f, apenasReincidencias: v }))}
                    />
                    <Label htmlFor="reincidencias" className="text-xs">Só Reincidências</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* KPIs de Volume */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Volume de Interações</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            titulo="Total de Interações"
            valor={kpis.totalInteracoes.valor}
            variacao={kpis.totalInteracoes.variacao}
            icon={MessageSquare}
            descricao="Total de interações registradas no período selecionado"
          />
          <KPICard
            titulo="Reclamações Abertas"
            valor={kpis.reclamacoesAbertas.valor}
            variacao={kpis.reclamacoesAbertas.variacao}
            icon={AlertTriangle}
            tipo={kpis.reclamacoesAbertas.valor > 5 ? 'danger' : kpis.reclamacoesAbertas.valor > 2 ? 'warning' : 'default'}
            invertido
            descricao="Reclamações ainda não resolvidas - requer atenção"
          />
          <KPICard
            titulo="Ações em Andamento"
            valor={kpis.acoesEmAndamento.valor}
            icon={Activity}
            descricao="Interações atualmente sendo trabalhadas pelo time"
          />
          <KPICard
            titulo="Concluídas"
            valor={kpis.concluidas.valor}
            variacao={kpis.concluidas.variacao}
            icon={CheckCircle2}
            tipo="success"
            descricao="Interações finalizadas com sucesso no período"
          />
        </div>
      </div>

      {/* KPIs de Risco */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Indicadores de Risco</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPICard
            titulo="Interações em Atraso"
            valor={kpis.emAtraso.valor}
            variacao={kpis.emAtraso.variacao}
            icon={Clock}
            tipo={kpis.emAtraso.valor > 3 ? 'danger' : kpis.emAtraso.valor > 0 ? 'warning' : 'success'}
            invertido
            descricao={`Abertas há mais de ${SLA_DIAS} dias (fora do SLA)`}
          />
          <KPICard
            titulo="Médicos Reincidentes"
            valor={kpis.medicosReincidentes.valor}
            icon={Users}
            tipo={kpis.medicosReincidentes.valor > 3 ? 'warning' : 'default'}
            descricao="Médicos com 2+ interações no período - padrão de problemas"
          />
          <KPICard
            titulo="Médicos em Risco Relacional"
            valor={kpis.medicosEmRisco.valor}
            icon={UserX}
            tipo={kpis.medicosEmRisco.valor > 0 ? 'danger' : 'success'}
            descricao="Médicos com reclamação + reincidência ou atraso - risco de evasão"
          />
        </div>
      </div>

      {/* Gráficos principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interações por Tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interações por Tipo</CardTitle>
            <CardDescription>Distribuição por natureza da interação</CardDescription>
          </CardHeader>
          <CardContent>
            {tipoData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={tipoData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="tipo" type="category" width={120} tick={{ fontSize: 12 }} />
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border rounded-lg p-3 shadow-lg">
                          <p className="font-medium">{data.tipo}</p>
                          <p className="text-sm text-muted-foreground">Quantidade: {data.quantidade}</p>
                          <p className="text-sm text-muted-foreground">Percentual: {data.percentual}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="quantidade" radius={[0, 4, 4, 0]}>
                    {tipoData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={
                          entry.tipo === 'Reclamação' ? 'hsl(0, 84%, 60%)' :
                          entry.tipo === 'Feedback Positivo' ? 'hsl(142, 76%, 36%)' :
                          entry.tipo === 'Ação Comemorativa' ? 'hsl(217, 91%, 60%)' :
                          'hsl(var(--muted-foreground))'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Sem dados disponíveis
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funil de Atendimento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil de Atendimento</CardTitle>
            <CardDescription>Conversão entre etapas e tempo médio</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funilData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="label" type="category" width={130} tick={{ fontSize: 11 }} />
                <RechartsTooltip 
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{data.label}</p>
                        <p className="text-sm">Quantidade: {data.valor}</p>
                        {data.conversao && <p className="text-sm">Conversão: {data.conversao}%</p>}
                        <p className="text-sm text-muted-foreground">Tempo médio: {data.tempoMedio} dias</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {funilData.map((entry, index) => {
                    const isGargalo = index > 0 && Number(entry.conversao) < 50;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={isGargalo ? 'hsl(0, 84%, 60%)' : entry.cor}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-2">
              {funilData.map((etapa, idx) => (
                idx > 0 && Number(etapa.conversao) < 50 && (
                  <Badge key={etapa.id} variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Gargalo: {etapa.label} ({etapa.conversao}%)
                  </Badge>
                )
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Status com SLA */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Eficiência de Atendimento (SLA)</CardTitle>
            <CardDescription>Gestão de prazos e performance</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusSlaData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <RechartsTooltip />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {statusSlaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">No prazo</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Fora do prazo</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Evolução Mensal */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Evolução Mensal</CardTitle>
                <CardDescription>Tendência e qualidade do relacionamento</CardDescription>
              </div>
              <Select value={evolucaoMetrica} onValueChange={(v: any) => setEvolucaoMetrica(v)}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="reclamacoes">Reclamações</SelectItem>
                  <SelectItem value="atraso">Em Atraso</SelectItem>
                  <SelectItem value="reincidentes">Reincidentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis />
                <RechartsTooltip 
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{label}</p>
                        <p className="text-sm">Total: {data.total}</p>
                        <p className="text-sm">Reclamações: {data.reclamacoes}</p>
                        <p className="text-sm">Em atraso: {data.atraso}</p>
                        <p className="text-sm">Reincidentes: {data.reincidentes}</p>
                      </div>
                    );
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey={evolucaoMetrica} 
                  stroke={
                    evolucaoMetrica === 'reclamacoes' ? 'hsl(0, 84%, 60%)' :
                    evolucaoMetrica === 'atraso' ? 'hsl(45, 93%, 47%)' :
                    'hsl(var(--primary))'
                  }
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {/* Linha de projeção (último ponto) */}
                {evolucaoMensal.length > 1 && (
                  <Line 
                    type="monotone" 
                    dataKey={evolucaoMetrica}
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    data={evolucaoMensal.slice(-2)}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Alertas Inteligentes */}
      {alertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertas de Relacionamento
            </CardTitle>
            <CardDescription>Situações que requerem atenção ou ação</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alertas.map((alerta, idx) => {
                const cores = {
                  critical: 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900',
                  warning: 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900',
                  info: 'border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900',
                  success: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900'
                };
                
                const icons = {
                  critical: <XCircle className="h-4 w-4 text-red-600" />,
                  warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
                  info: <AlertCircle className="h-4 w-4 text-blue-600" />,
                  success: <ThumbsUp className="h-4 w-4 text-emerald-600" />
                };

                return (
                  <div 
                    key={idx} 
                    className={cn(
                      "p-3 rounded-lg border flex items-start gap-3",
                      cores[alerta.tipo]
                    )}
                  >
                    <div className="mt-0.5">{icons[alerta.tipo]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{alerta.titulo}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{alerta.descricao}</p>
                    </div>
                    {alerta.acao && (
                      <Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs">
                        {alerta.acao}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sem dados */}
      {dadosFiltrados.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Sem dados disponíveis para os filtros selecionados</p>
            {hasActiveFilters && (
              <Button variant="link" onClick={resetFilters} className="mt-2">
                Limpar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
