import { useState } from "react";
import { useDisparosBI, DisparosKPI, AlertaCaptacao } from "@/hooks/useDisparosBI";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart, Bar, PieChart, Pie, LineChart, Line, Cell, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  ComposedChart, Area, Funnel, FunnelChart, LabelList
} from "recharts";
import { 
  Send, CheckCircle, MessageCircle, AlertCircle, TrendingUp, TrendingDown,
  MessageSquare, UserPlus, Users, UserMinus, Award, AlertTriangle,
  Filter, ArrowUpRight, ArrowDownRight, Minus, ExternalLink, Stethoscope,
  Mail, MessageSquareMore, BarChart3, PieChartIcon, Activity, Trophy
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const COLORS = {
  primary: 'hsl(var(--primary))',
  accent: 'hsl(var(--accent))',
  secondary: 'hsl(var(--secondary))',
  muted: 'hsl(var(--muted))',
  destructive: 'hsl(var(--destructive))',
  success: 'hsl(142, 76%, 36%)',
  warning: 'hsl(38, 92%, 50%)',
  whatsapp: 'hsl(142, 70%, 45%)',
  email: 'hsl(220, 90%, 56%)',
};

// Ícones mapeados
const ICONES: Record<string, React.ReactNode> = {
  Send: <Send className="h-5 w-5" />,
  CheckCircle: <CheckCircle className="h-5 w-5" />,
  MessageCircle: <MessageCircle className="h-5 w-5" />,
  AlertCircle: <AlertCircle className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  UserPlus: <UserPlus className="h-5 w-5" />,
  Stethoscope: <Stethoscope className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  UserMinus: <UserMinus className="h-5 w-5" />,
  Award: <Award className="h-5 w-5" />,
};

// Componente KPI Card
function KPICard({ kpi }: { kpi: DisparosKPI }) {
  const corClasse = {
    green: 'text-green-600 dark:text-green-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    red: 'text-red-600 dark:text-red-400',
    neutral: 'text-muted-foreground',
  }[kpi.cor];

  const bgClasse = {
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
    neutral: 'bg-card border-border',
  }[kpi.cor];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={cn("transition-all hover:shadow-md cursor-default", bgClasse)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={cn("p-2 rounded-lg bg-background/80", corClasse)}>
                  {ICONES[kpi.icone] || <Activity className="h-5 w-5" />}
                </span>
                {kpi.comparacao !== undefined && (
                  <div className={cn("flex items-center gap-1 text-sm font-medium", 
                    kpi.comparacao > 0 ? 'text-green-600' : kpi.comparacao < 0 ? 'text-red-600' : 'text-muted-foreground'
                  )}>
                    {kpi.comparacao > 0 ? <ArrowUpRight className="h-4 w-4" /> : 
                     kpi.comparacao < 0 ? <ArrowDownRight className="h-4 w-4" /> : 
                     <Minus className="h-4 w-4" />}
                    {Math.abs(kpi.comparacao).toFixed(1)}%
                  </div>
                )}
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
            </CardContent>
          </Card>
        </TooltipTrigger>
        {kpi.tooltip && (
          <TooltipContent>
            <p>{kpi.tooltip}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente Alerta Card
function AlertaCard({ alerta, onAction }: { alerta: AlertaCaptacao; onAction?: () => void }) {
  const config = {
    error: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200', icon: <AlertCircle className="h-5 w-5 text-red-600" /> },
    warning: { bg: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-yellow-200', icon: <AlertTriangle className="h-5 w-5 text-yellow-600" /> },
    info: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200', icon: <MessageCircle className="h-5 w-5 text-blue-600" /> },
  }[alerta.tipo];

  return (
    <div className={cn("p-4 rounded-lg border", config.bg, config.border)}>
      <div className="flex items-start gap-3">
        {config.icon}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{alerta.titulo}</p>
          <p className="text-xs text-muted-foreground mt-1">{alerta.descricao}</p>
        </div>
        {alerta.acao && (
          <Button variant="ghost" size="sm" onClick={onAction} className="shrink-0">
            {alerta.acao}
            {alerta.link && <ExternalLink className="h-3 w-3 ml-1" />}
          </Button>
        )}
      </div>
    </div>
  );
}

export function AbaDisparos() {
  const navigate = useNavigate();
  const { 
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
    isLoading 
  } = useDisparosBI();

  const [metricaEspecialidade, setMetricaEspecialidade] = useState<'disparos' | 'leads' | 'medicos'>('disparos');

  // Separar KPIs por tipo
  const kpisVolume = kpis.filter(k => k.tipo === 'volume');
  const kpisConversao = kpis.filter(k => k.tipo === 'conversao');
  const kpisEficiencia = kpis.filter(k => k.tipo === 'eficiencia');

  // Dados do gráfico de especialidade com base na métrica selecionada
  const dadosEspecialidadeGrafico = dadosPorEspecialidade.map(esp => ({
    ...esp,
    valor: esp[metricaEspecialidade],
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros Expandidos */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Filtros do Dashboard</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {/* Período */}
            <div className="lg:col-span-2">
              <FiltroPeriodo
                dataInicio={filtros.dataInicio}
                dataFim={filtros.dataFim}
                onDataInicioChange={(v) => setFiltros({ ...filtros, dataInicio: v })}
                onDataFimChange={(v) => setFiltros({ ...filtros, dataFim: v })}
              />
            </div>
            
            {/* Canal */}
            <div className="space-y-2">
              <Label className="text-xs">Canal</Label>
              <Select value={filtros.canal} onValueChange={(v) => setFiltros({ ...filtros, canal: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os canais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campanha */}
            <div className="space-y-2">
              <Label className="text-xs">Campanha</Label>
              <Select value={filtros.campanha || "__all__"} onValueChange={(v) => setFiltros({ ...filtros, campanha: v === "__all__" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {opcoesFiltros.campanhas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Especialidade */}
            <div className="space-y-2">
              <Label className="text-xs">Especialidade</Label>
              <Select value={filtros.especialidade || "__all__"} onValueChange={(v) => setFiltros({ ...filtros, especialidade: v === "__all__" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {opcoesFiltros.especialidades.filter(esp => esp).map(esp => (
                    <SelectItem key={esp} value={esp!}>{esp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Captador */}
            <div className="space-y-2">
              <Label className="text-xs">Captador</Label>
              <Select value={filtros.captador || "__all__"} onValueChange={(v) => setFiltros({ ...filtros, captador: v === "__all__" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {opcoesFiltros.captadores.filter(cap => cap.id).map(cap => (
                    <SelectItem key={cap.id!} value={cap.id!}>{cap.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status Lead */}
            <div className="space-y-2">
              <Label className="text-xs">Status do Lead</Label>
              <Select value={filtros.statusLead || "__all__"} onValueChange={(v) => setFiltros({ ...filtros, statusLead: v === "__all__" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {opcoesFiltros.statusLeads.map(st => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6 lg:col-span-2">
              <div className="flex items-center gap-2">
                <Switch 
                  id="ativos" 
                  checked={filtros.apenasAtivos} 
                  onCheckedChange={(v) => setFiltros({ ...filtros, apenasAtivos: v, apenasPerdidos: false })}
                />
                <Label htmlFor="ativos" className="text-xs">Apenas leads ativos</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  id="perdidos" 
                  checked={filtros.apenasPerdidos} 
                  onCheckedChange={(v) => setFiltros({ ...filtros, apenasPerdidos: v, apenasAtivos: false })}
                />
                <Label htmlFor="perdidos" className="text-xs">Apenas perdidos</Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs de Volume */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Volume de Disparos
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpisVolume.map((kpi, idx) => (
            <KPICard key={idx} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* KPIs de Conversão */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Taxas de Conversão
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpisConversao.map((kpi, idx) => (
            <KPICard key={idx} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* KPIs de Eficiência */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Eficiência do Funil
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {kpisEficiencia.map((kpi, idx) => (
            <KPICard key={idx} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* Alertas Inteligentes */}
      {alertas.length > 0 && (
        <Card className="border-dashed border-2 border-yellow-300 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Alertas Inteligentes de Captação
            </CardTitle>
            <CardDescription>
              Situações que requerem atenção imediata
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alertas.slice(0, 6).map((alerta, idx) => (
                <AlertaCard 
                  key={idx} 
                  alerta={alerta} 
                  onAction={alerta.link ? () => navigate(alerta.link!) : undefined}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos - Linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evolução de Disparos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Evolução de Disparos
            </CardTitle>
            <CardDescription>
              Mensagens enviadas, respondidas, leads e médicos ao longo do tempo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mes" className="text-xs" />
                <YAxis className="text-xs" />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                />
                <Legend />
                <Area type="monotone" dataKey="enviados" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" name="Enviados" />
                <Line type="monotone" dataKey="respondidos" stroke={COLORS.accent} strokeWidth={2} name="Respondidos" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="leads" stroke={COLORS.warning} strokeWidth={2} name="Leads Gerados" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="medicos" stroke={COLORS.success} strokeWidth={2} name="Médicos" dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Disparos por Canal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5" />
              Comparativo por Canal
            </CardTitle>
            <CardDescription>
              Performance de WhatsApp vs Email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {dadosPorCanal.map((canal, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "p-4 rounded-lg border-2",
                    canal.canal === 'WhatsApp' ? 'border-green-300 bg-green-50 dark:bg-green-950/30' : 'border-blue-300 bg-blue-50 dark:bg-blue-950/30'
                  )}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {canal.canal === 'WhatsApp' ? (
                      <MessageSquareMore className="h-5 w-5 text-green-600" />
                    ) : (
                      <Mail className="h-5 w-5 text-blue-600" />
                    )}
                    <span className="font-semibold">{canal.canal}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Enviados</span>
                      <span className="font-medium">{canal.enviados.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Respondidos</span>
                      <span className="font-medium">{canal.respondidos.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conversões</span>
                      <span className="font-medium text-green-600">{canal.conversoes.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Falhas</span>
                      <span className="font-medium text-red-600">{canal.falhas.toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxa Resposta</span>
                        <span className="font-bold">
                          {canal.enviados > 0 ? ((canal.respondidos / canal.enviados) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={dadosPorCanal} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="canal" type="category" className="text-xs" width={80} />
                <RechartsTooltip />
                <Bar dataKey="enviados" fill={COLORS.primary} name="Enviados" />
                <Bar dataKey="conversoes" fill={COLORS.success} name="Conversões" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Funil de Conversão - DESTAQUE VISUAL */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="h-6 w-6 text-primary" />
            Funil de Conversão Completo
          </CardTitle>
          <CardDescription>
            Visualize cada etapa da jornada: do disparo ao médico cadastrado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-2 items-stretch">
            {funilConversao.filter(e => !e.etapa.includes('Descartados')).map((etapa, idx, arr) => {
              const maxValor = arr[0]?.valor || 1;
              const percentualAltura = Math.max(20, (etapa.valor / maxValor) * 100);
              const isLast = idx === arr.length - 1;
              const cores = [
                'from-blue-500 to-blue-600',
                'from-blue-400 to-blue-500', 
                'from-cyan-400 to-cyan-500',
                'from-teal-400 to-teal-500',
                'from-emerald-400 to-emerald-500',
                'from-green-500 to-green-600',
              ];
              
              return (
                <div key={idx} className="flex flex-col items-center">
                  {/* Barra do funil */}
                  <div 
                    className="relative w-full flex flex-col items-center justify-end"
                    style={{ minHeight: '180px' }}
                  >
                    <div 
                      className={cn(
                        "w-full rounded-t-lg bg-gradient-to-b shadow-lg transition-all duration-500 hover:scale-105",
                        cores[idx] || cores[0]
                      )}
                      style={{ 
                        height: `${percentualAltura}%`,
                        minHeight: '40px',
                        clipPath: idx === 0 ? 'none' : 'polygon(10% 0, 90% 0, 100% 100%, 0% 100%)'
                      }}
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-bold text-lg drop-shadow-md">
                          {etapa.valor.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Seta de conversão */}
                  {!isLast && (
                    <div className="flex items-center justify-center py-1">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                        <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-primary font-bold">{etapa.conversao}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Nome da etapa */}
                  <div className="mt-2 text-center px-1">
                    <p className="text-xs font-semibold leading-tight text-foreground">
                      {etapa.etapa}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Leads Perdidos - Separado */}
          {funilConversao.filter(e => e.etapa.includes('Descartados')).map((etapa, idx) => (
            <div key={idx} className="mt-6 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                    <UserMinus className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-400">{etapa.etapa}</p>
                    <p className="text-xs text-red-600/70">Saídas do funil</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-600">{etapa.valor.toLocaleString()}</p>
                  <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                    {etapa.conversao} dos leads
                  </Badge>
                </div>
              </div>
            </div>
          ))}
          
          {/* Resumo Executivo */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border border-blue-200 dark:border-blue-800">
              <p className="text-3xl font-bold text-blue-600">{metricas.totalEnviados.toLocaleString()}</p>
              <p className="text-sm text-blue-700/70 dark:text-blue-400/70 font-medium">Disparos Enviados</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/50 dark:to-cyan-900/30 border border-cyan-200 dark:border-cyan-800">
              <p className="text-3xl font-bold text-cyan-600">{metricas.totalRespondidos.toLocaleString()}</p>
              <p className="text-sm text-cyan-700/70 dark:text-cyan-400/70 font-medium">Respostas</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/50 dark:to-teal-900/30 border border-teal-200 dark:border-teal-800">
              <p className="text-3xl font-bold text-teal-600">{metricas.leadsGerados.toLocaleString()}</p>
              <p className="text-sm text-teal-700/70 dark:text-teal-400/70 font-medium">Leads Gerados</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/30 border border-green-200 dark:border-green-800">
              <p className="text-3xl font-bold text-green-600">{metricas.medicosConvertidos}</p>
              <p className="text-sm text-green-700/70 dark:text-green-400/70 font-medium">Médicos Cadastrados</p>
            </div>
          </div>
          
          {/* Taxa de conversão geral */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Taxa de Conversão Geral (Disparo → Médico)</span>
              <span className={cn(
                "text-2xl font-bold",
                metricas.taxaConversaoMedico >= 5 ? "text-green-600" : 
                metricas.taxaConversaoMedico >= 1 ? "text-yellow-600" : "text-red-600"
              )}>
                {metricas.taxaConversaoMedico.toFixed(2)}%
              </span>
            </div>
            <Progress 
              value={Math.min(metricas.taxaConversaoMedico * 10, 100)} 
              className="h-3 mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Gráficos - Linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Disparos por Especialidade */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5" />
                  Por Especialidade
                </CardTitle>
                <CardDescription>
                  Identificar especialidades mais responsivas
                </CardDescription>
              </div>
              <Select 
                value={metricaEspecialidade} 
                onValueChange={(v) => setMetricaEspecialidade(v as 'disparos' | 'leads' | 'medicos')}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disparos">Disparos</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="medicos">Médicos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosEspecialidadeGrafico} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis 
                  dataKey="especialidade" 
                  type="category" 
                  className="text-xs" 
                  width={100}
                  tickFormatter={(v) => v.length > 12 ? v.slice(0, 12) + '...' : v}
                />
                <RechartsTooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar 
                  dataKey="valor" 
                  fill={metricaEspecialidade === 'disparos' ? COLORS.primary : 
                        metricaEspecialidade === 'leads' ? COLORS.warning : COLORS.success}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Ranking de Captadores */}
      {performanceCaptadores.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Performance por Captador
            </CardTitle>
            <CardDescription>
              Ranking de captadores por taxa de conversão
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Posição</th>
                    <th className="pb-3 font-medium">Captador</th>
                    <th className="pb-3 font-medium text-right">Mensagens</th>
                    <th className="pb-3 font-medium text-right">Leads</th>
                    <th className="pb-3 font-medium text-right">Conversões</th>
                    <th className="pb-3 font-medium text-right">Taxa</th>
                    <th className="pb-3 font-medium text-right">Tempo Resp.</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceCaptadores.slice(0, 10).map((cap, idx) => (
                    <tr key={cap.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="py-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          idx === 0 && "bg-yellow-100 text-yellow-700",
                          idx === 1 && "bg-gray-100 text-gray-700",
                          idx === 2 && "bg-orange-100 text-orange-700",
                          idx > 2 && "bg-muted text-muted-foreground"
                        )}>
                          {idx + 1}
                        </div>
                      </td>
                      <td className="py-3 font-medium">{cap.nome}</td>
                      <td className="py-3 text-right">{cap.enviados.toLocaleString()}</td>
                      <td className="py-3 text-right">{cap.leadsGerados.toLocaleString()}</td>
                      <td className="py-3 text-right text-green-600 font-medium">{cap.conversoes}</td>
                      <td className="py-3 text-right">
                        <Badge 
                          variant={cap.taxaConversao >= 1 ? "default" : "secondary"}
                          className={cn(
                            cap.taxaConversao >= 1 && "bg-green-100 text-green-700 hover:bg-green-100"
                          )}
                        >
                          {cap.taxaConversao.toFixed(2)}%
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-muted-foreground">{cap.tempoMedioResposta}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navegação Rápida */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Navegação Rápida</CardTitle>
          <CardDescription>Acesse os módulos operacionais</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate('/disparos/zap')}>
              <MessageSquareMore className="h-4 w-4 mr-2" />
              SIG Zap
            </Button>
            <Button variant="outline" onClick={() => navigate('/disparos/leads')}>
              <Users className="h-4 w-4 mr-2" />
              Leads
            </Button>
            <Button variant="outline" onClick={() => navigate('/disparos/acompanhamento')}>
              <Activity className="h-4 w-4 mr-2" />
              Acompanhamento
            </Button>
            <Button variant="outline" onClick={() => navigate('/disparos/blacklist')}>
              <UserMinus className="h-4 w-4 mr-2" />
              Blacklist
            </Button>
            <Button variant="outline" onClick={() => navigate('/disparos/email')}>
              <Mail className="h-4 w-4 mr-2" />
              Disparos Email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
