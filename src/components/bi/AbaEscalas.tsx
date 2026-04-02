import { useState } from "react";
import { useEscalasBI, AlertaEscala } from "@/hooks/useEscalasBI";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line
} from "recharts";
import { 
  TrendingUp, TrendingDown, Calendar, Clock, Users, Building2, 
  AlertTriangle, ShieldAlert, Activity, UserX, Percent, Info, BarChart3, Target, CheckCircle, Database
} from "lucide-react";
import { ExpandableChart } from "./escalas/ExpandableChart";
import { ExpandableProfessionalChart } from "./escalas/ExpandableProfessionalChart";
import { ExpandableLoadDistribution } from "./escalas/ExpandableLoadDistribution";
import { AbaDrEscala } from "./AbaDrEscala";

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const COLORS = ['hsl(142, 76%, 36%)', 'hsl(200, 80%, 50%)', 'hsl(45, 93%, 47%)', 'hsl(280, 60%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(180, 60%, 45%)'];
const DANGER_COLOR = 'hsl(0, 84%, 60%)';
const WARNING_COLOR = 'hsl(38, 92%, 50%)';
const SUCCESS_COLOR = 'hsl(142, 76%, 36%)';

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
];

function KPICard({ 
  title, value, subtitle, icon: Icon, variacao, variacaoLabel = "vs mês anterior",
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent className="max-w-xs"><p>{tooltip}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

function AlertCard({ alerta }: { alerta: AlertaEscala }) {
  const bgClass = alerta.tipo === 'risco' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
    : alerta.tipo === 'atencao' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
    : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800';
  
  const Icon = alerta.tipo === 'risco' ? ShieldAlert : alerta.tipo === 'atencao' ? AlertTriangle : Info;
  const iconClass = alerta.tipo === 'risco' ? 'text-red-600' : alerta.tipo === 'atencao' ? 'text-amber-600' : 'text-blue-600';

  return (
    <Card className={`${bgClass} border`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={`h-5 w-5 mt-0.5 ${iconClass}`} />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">{alerta.titulo}</h4>
            <p className="text-xs text-muted-foreground mt-1">{alerta.descricao}</p>
          </div>
          {alerta.valor !== undefined && (
            <span className={`text-lg font-bold ${iconClass}`}>{alerta.valor}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AbaEscalas() {
  const [fonteDados, setFonteDados] = useState<"manual" | "drescala">("manual");
  const {
    filters,
    setMes,
    setAno,
    setLocalId,
    setSetorId,
    setProfissional,
    locais,
    setores,
    metricas,
    analises,
    alertas,
    isLoading,
  } = useEscalasBI();

  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Filtros Globais */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Fonte de Dados</Label>
                <Select value={fonteDados} onValueChange={(v) => setFonteDados(v as "manual" | "drescala")}>
                  <SelectTrigger className="w-[160px]">
                    <Database className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Escalas Internas</SelectItem>
                    <SelectItem value="drescala">Dr. Escala</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {fonteDados === "manual" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Mês</Label>
                    <Select value={String(filters.mes)} onValueChange={(v) => setMes(Number(v))}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MESES.map((m) => (
                          <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ano</Label>
                    <Select value={String(filters.ano)} onValueChange={(v) => setAno(Number(v))}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {anos.map((a) => (
                          <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Local (Hospital)</Label>
                    <Select value={filters.localId} onValueChange={setLocalId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {locais.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Setor</Label>
                    <Select value={filters.setorId} onValueChange={setSetorId}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {setores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Profissional</Label>
                    <Input 
                      placeholder="Buscar..." 
                      className="w-[180px]"
                      value={filters.profissional}
                      onChange={(e) => setProfissional(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {fonteDados === "drescala" ? (
          <AbaDrEscala />
        ) : (
        <>
        {/* Alertas Estratégicos */}
        {alertas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alertas.map((alerta, idx) => (
              <AlertCard key={idx} alerta={alerta} />
            ))}
          </div>
        )}

        {/* KPIs Executivos */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Visão Executiva
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KPICard
              title="Total Plantões"
              value={metricas.totalPlantoes.toLocaleString("pt-BR")}
              subtitle="no período"
              icon={Calendar}
              variacao={metricas.variacaoPlantoes}
              tooltip="Total de plantões escalados no período selecionado"
            />
            <KPICard
              title="Horas Escaladas"
              value={`${metricas.horasEscaladas.toLocaleString("pt-BR")}h`}
              subtitle="cobertura efetiva"
              icon={Clock}
              variacao={metricas.variacaoHoras}
              tooltip="Total de horas com profissional alocado"
            />
            <KPICard
              title="Profissionais"
              value={metricas.profissionaisAtivos}
              subtitle="ativos no período"
              icon={Users}
              tooltip="Quantidade de profissionais únicos escalados"
            />
            <KPICard
              title="Média Horas/Prof"
              value={`${metricas.mediaHorasPorProfissional}h`}
              subtitle="por profissional"
              icon={Activity}
              tooltip="Média de horas trabalhadas por profissional"
            />
            <KPICard
              title="Plantões/Dia"
              value={metricas.mediaPlantoesporDia.toFixed(1)}
              subtitle="média diária"
              icon={Target}
              tooltip="Média de plantões por dia no período"
            />
            <KPICard
              title="Dados Completos"
              value={`${metricas.percentualCompletos}%`}
              subtitle={`${metricas.incompletos} incompletos`}
              icon={CheckCircle}
              variant={metricas.percentualCompletos >= 95 ? "success" : metricas.percentualCompletos >= 85 ? "warning" : "danger"}
              tooltip="Percentual de registros com dados completos para análise"
            />
          </div>
        </div>

        {/* KPIs de Furo de Escala */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500" />
            Indicadores de Risco - Furos de Escala
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              title="Total Furos"
              value={metricas.totalFuros}
              subtitle="sem profissional"
              icon={UserX}
              variant={metricas.totalFuros > 0 ? "danger" : "success"}
              variacao={metricas.variacaoFuros}
              variacaoLabel="vs mês anterior"
              tooltip="Plantões sem profissional alocado"
            />
            <KPICard
              title="% Furos"
              value={`${metricas.percentualFuros}%`}
              subtitle="do total"
              icon={Percent}
              variant={metricas.percentualFuros > 5 ? "danger" : metricas.percentualFuros > 2 ? "warning" : "success"}
              tooltip="Percentual de plantões descobertos"
            />
            <KPICard
              title="Horas Descobertas"
              value={`${metricas.horasDescobertas}h`}
              subtitle="sem cobertura"
              icon={Clock}
              variant={metricas.horasDescobertas > 50 ? "danger" : metricas.horasDescobertas > 20 ? "warning" : "success"}
              tooltip="Total de horas sem profissional alocado"
            />
            <KPICard
              title="Dias com Furo"
              value={metricas.diasComFuro}
              subtitle="dias afetados"
              icon={Calendar}
              variant={metricas.diasComFuro > 5 ? "danger" : metricas.diasComFuro > 2 ? "warning" : "success"}
              tooltip="Quantidade de dias com pelo menos um furo de escala"
            />
          </div>
        </div>

        {/* Abas de Análise */}
        <Tabs defaultValue="distribuicao" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
            <TabsTrigger value="profissionais">Profissionais</TabsTrigger>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="furos">Furos Detalhado</TabsTrigger>
          </TabsList>

          {/* Aba Distribuição */}
          <TabsContent value="distribuicao" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ExpandableChart
                title="Plantões por Setor"
                data={analises.plantoesPorSetor}
                dataKey="plantoes"
                color="hsl(var(--primary))"
                limit={10}
              />
              <ExpandableChart
                title="Horas por Setor"
                data={analises.horasPorSetor}
                dataKey="horas"
                color="hsl(var(--accent))"
                tooltipFormatter={(v) => `${v}h`}
                limit={10}
              />
              <ExpandableChart
                title="Plantões por Local"
                data={analises.plantoesPorLocal}
                dataKey="plantoes"
                color={COLORS[1]}
                labelWidth={150}
                limit={10}
              />
              <ExpandableChart
                title="Horas por Local"
                data={analises.horasPorLocal}
                dataKey="horas"
                color={COLORS[2]}
                labelWidth={150}
                tooltipFormatter={(v) => `${v}h`}
                limit={10}
              />
            </div>
          </TabsContent>

          {/* Aba Profissionais */}
          <TabsContent value="profissionais" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ExpandableProfessionalChart
                title="Top 10 Profissionais por Horas"
                data={analises.topProfissionaisPorHoras}
                dataKey="horas"
                color={SUCCESS_COLOR}
                limit={10}
              />
              <ExpandableProfessionalChart
                title="Top 10 Profissionais por Plantões"
                data={analises.topProfissionaisPorPlantoes}
                dataKey="plantoes"
                color={COLORS[1]}
                limit={10}
              />
              <ExpandableLoadDistribution
                data={analises.topProfissionaisPorHoras}
                limit={10}
              />
            </div>
          </TabsContent>

          {/* Aba Operacional */}
          <TabsContent value="operacional" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Plantões por Dia da Semana</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analises.plantoesPorDiaSemana}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="plantoes" fill="hsl(var(--primary))" name="Plantões" />
                      <Bar dataKey="furos" fill={DANGER_COLOR} name="Furos" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Plantões por Faixa de Horário</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analises.plantoesPorFaixaHorario}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="faixa" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="plantoes" fill="hsl(var(--primary))" name="Plantões" />
                      <Bar dataKey="furos" fill={DANGER_COLOR} name="Furos" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Furos por Dia no Período</CardTitle>
                </CardHeader>
                <CardContent>
                  {analises.furosPorDia.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={analises.furosPorDia}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="data" 
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        />
                        <YAxis />
                        <RechartsTooltip 
                          labelFormatter={(v) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR")}
                        />
                        <Line type="monotone" dataKey="furos" stroke={DANGER_COLOR} strokeWidth={2} dot={{ fill: DANGER_COLOR }} name="Furos" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Nenhum furo no período selecionado</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Aba Furos Detalhado */}
          <TabsContent value="furos" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ExpandableChart
                title="Furos por Setor"
                icon={<ShieldAlert className="h-4 w-4 text-red-500" />}
                data={analises.furosPorSetor}
                dataKey="furos"
                color={DANGER_COLOR}
                limit={10}
              />
              <ExpandableChart
                title="Furos por Local"
                icon={<Building2 className="h-4 w-4 text-red-500" />}
                data={analises.furosPorLocal}
                dataKey="furos"
                color={DANGER_COLOR}
                labelWidth={150}
                limit={10}
              />
              <ExpandableChart
                title="Horas Descobertas por Setor"
                data={analises.furosPorSetor}
                dataKey="horas"
                color={WARNING_COLOR}
                tooltipFormatter={(v) => `${v}h`}
                limit={10}
              />
              <ExpandableChart
                title="Horas Descobertas por Local"
                data={analises.furosPorLocal}
                dataKey="horas"
                color={WARNING_COLOR}
                labelWidth={150}
                tooltipFormatter={(v) => `${v}h`}
                limit={10}
              />
            </div>
          </TabsContent>
        </Tabs>
        </>
        )}
      </div>
    </TooltipProvider>
  );
}
