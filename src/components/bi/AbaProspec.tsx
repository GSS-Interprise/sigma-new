import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, Trophy, TrendingUp, Megaphone, Users, Target, Radio, MousePointer, BarChart3, Mail, Instagram, Stethoscope, UserCheck, XCircle, MessageSquare, RotateCcw, Lock, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";

// Paleta light (alinhada ao restante do /bi — shadcn/Tailwind)
const C = {
  blue: "#2563eb",
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
  pink: "#db2777",
  purple: "#7c3aed",
  cyan: "#0891b2",
  orange: "#ea580c",
};
const PIE = [C.blue, C.green, C.amber, C.pink, C.purple, C.cyan];
const GRID = "#e2e8f0";
const AXIS = "#64748b";

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

function startOfMonthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function KPI({ icon: Icon, label, value, sub, color = C.blue }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="p-2 rounded-lg" style={{ background: `${color}1a`, color }}>
            <Icon className="h-4 w-4" />
          </span>
          {sub && <span className="text-xs font-semibold" style={{ color }}>{sub}</span>}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function PanelCard({ title, description, icon: Icon, children, className = "" }: any) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AbaProspec() {
  const [dataInicio, setDataInicio] = useState(startOfMonthsAgo(5));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));
  const [tabAtiva, setTabAtiva] = useState<string>("resumo");

  const PERIODO_INICIO_DEFAULT = startOfMonthsAgo(5);
  const PERIODO_FIM_DEFAULT = new Date().toISOString().slice(0, 10);

  const handleLimparFiltros = () => {
    setDataInicio(PERIODO_INICIO_DEFAULT);
    setDataFim(PERIODO_FIM_DEFAULT);
    setTabAtiva("resumo");
  };

  // === Dashboard agregado via RPC (1 chamada) ===
  const { data: dashboard, isLoading, error: dashboardError, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["bi-prospec-dashboard", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_prospec_dashboard", {
        p_inicio: `${dataInicio}T00:00:00`,
        p_fim: `${dataFim}T23:59:59`,
      });
      if (error) {
        if (error.code === "42501" || (error.message || "").toLowerCase().includes("permiss")) {
          toast.error("Sem permissão para visualizar o BI Prospec. Peça acesso (captacao.view) ao admin.");
        } else {
          toast.error(`Erro ao carregar BI: ${error.message}`);
        }
        throw error;
      }
      return data as any;
    },
    staleTime: 60_000,
    retry: false,
  });

  const semPermissao = (dashboardError as any)?.code === "42501";

  // Chips de tráfego pago (consulta separada, leve)
  const { data: chips } = useQuery({
    queryKey: ["bi-prospec-chips"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chips")
        .select("id,nome,is_trafego_pago,tipo_instancia");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60_000,
  });

  // === Resumo executivo: séries de apoio (views novas) ===
  const META_DISPAROS_DIA = 700; // 20 chips × 35/dia (anti-ban WS2)

  const { data: disparosDiariosRaw } = useQuery({
    queryKey: ["bi-resumo-disparos-diarios", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_disparos_diarios")
        .select("dia, n_disparos")
        .gte("dia", dataInicio)
        .lte("dia", dataFim)
        .order("dia");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    retry: false,
  });

  const { data: captadoraProd } = useQuery({
    queryKey: ["bi-resumo-captadora"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_captadora_produtividade")
        .select("nome_completo, massa_enviados, manuais_enviados, convertidos_campanha, conversoes_totais, leads_assumidos, taxa_conversao_pct");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    retry: false,
  });

  const serieDisparos = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const r of disparosDiariosRaw ?? []) {
      porDia.set(r.dia, (porDia.get(r.dia) || 0) + (Number(r.n_disparos) || 0));
    }
    return [...porDia.entries()]
      .map(([dia, n]) => ({ dia: dia.slice(5), disparos: n }))
      .sort((a, b) => (a.dia < b.dia ? -1 : 1));
  }, [disparosDiariosRaw]);

  const mediaDisparosDia = useMemo(() => {
    if (!serieDisparos.length) return 0;
    const soma = serieDisparos.reduce((s, r) => s + r.disparos, 0);
    return Math.round(soma / serieDisparos.length);
  }, [serieDisparos]);

  const topCaptadoras = useMemo(
    () => [...(captadoraProd ?? [])]
      .map((c) => ({
        nome: (c.nome_completo || "—").split(" ").slice(0, 2).join(" "),
        enviados: (Number(c.massa_enviados) || 0) + (Number(c.manuais_enviados) || 0),
        convertidos: (Number(c.convertidos_campanha) || 0) + (Number(c.conversoes_totais) || 0),
      }))
      .filter((c) => c.enviados > 0)
      .sort((a, b) => b.enviados - a.enviados)
      .slice(0, 8),
    [captadoraProd]
  );

  // Desestrutura RPC com defaults seguros
  const totais = (dashboard?.totais ?? {}) as any;
  const porCanal = (dashboard?.por_canal ?? {}) as any;
  const trafegoPago: any[] = dashboard?.propostas_trafego ?? [];
  const campanhasMetricas: any[] = dashboard?.top_campanhas ?? [];

  const totaisTrafego = {
    enviados: Number(totais.trafego_enviados) || 0,
    responderam: Number(totais.trafego_responderam) || 0,
    emConversa: Number(totais.trafego_em_conversa) || 0,
    aceitaram: Number(totais.trafego_aceitaram) || 0,
    convertidos: Number(totais.trafego_convertidos) || 0,
  };

  const evolucaoMensal = useMemo(
    () => (dashboard?.evolucao_mensal ?? []).map((r: any) => ({
      mes: r.mes,
      manual: Number(r.manual) || 0,
      massa: Number(r.massa) || 0,
      trafego: Number(r.trafego) || 0,
      respostas: Number(r.respostas) || 0,
      convertidos: Number(r.convertidos) || 0,
    })),
    [dashboard]
  );

  const resumoTipos = useMemo(() => ([
    { tipo: "Manual", total: Number(totais.manuais) || 0 },
    { tipo: "Em Massa", total: Number(totais.massa_enviados) || 0 },
    { tipo: "Tráfego Pago", total: Number(totais.trafego_enviados) || 0 },
    { tipo: "Email", total: Number(totais.emails_enviados) || 0 },
    { tipo: "Instagram", total: Number(totais.instagram_enviados) || 0 },
  ]), [totais]);

  const totalGeralDisparos = resumoTipos.reduce((s, r) => s + r.total, 0);

  const topCampanhas = useMemo(() => [...campanhasMetricas].slice(0, 8), [campanhasMetricas]);
  const topPropostas: any[] = dashboard?.top_propostas ?? [];
  const chipsTrafego = (chips ?? []).filter((c) => c.is_trafego_pago);

  const porEspecialidade: any[] = dashboard?.por_especialidade ?? [];
  const convPorColaborador: any[] = dashboard?.por_colaborador ?? [];
  const motivosNaoConversao: any[] = (dashboard?.motivos_nao_conversao ?? []).map((m: any) => ({
    motivo: m.motivo,
    total: Number(m.total) || 0,
  }));

  const metricasPorCanal = {
    whatsapp: {
      enviados: Number(porCanal?.whatsapp?.enviados) || 0,
      responderam: Number(porCanal?.whatsapp?.responderam) || 0,
      convertidos: Number(porCanal?.whatsapp?.convertidos) || 0,
    },
    email: {
      enviados: Number(porCanal?.email?.enviados) || 0,
      responderam: Number(porCanal?.email?.responderam) || 0,
      convertidos: Number(porCanal?.email?.convertidos) || 0,
    },
    trafego: {
      enviados: totaisTrafego.enviados,
      responderam: totaisTrafego.responderam,
      convertidos: totaisTrafego.convertidos,
    },
    instagram: {
      enviados: Number(porCanal?.instagram?.enviados) || 0,
      responderam: Number(porCanal?.instagram?.responderam) || 0,
      convertidos: Number(porCanal?.instagram?.convertidos) || 0,
    },
  };

  const totaisGerais = {
    responderam: Number(totais.responderam_geral) || 0,
    convertidos: Number(totais.convertidos_geral) || 0,
  };

  if (semPermissao) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3 text-center">
        <Lock className="h-10 w-10 text-amber-500" />
        <h2 className="text-xl font-semibold">Sem permissão</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Você não tem permissão para visualizar o BI Prospec. Peça ao administrador para liberar a permissão <code className="px-1.5 py-0.5 rounded bg-muted text-foreground">captacao.view</code>.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const taxaResp = totalGeralDisparos > 0 ? ((totaisGerais.responderam / totalGeralDisparos) * 100).toFixed(1) : "0";
  const taxaConv = totalGeralDisparos > 0 ? ((totaisGerais.convertidos / totalGeralDisparos) * 100).toFixed(1) : "0";

  // Ritmo vs meta de disparos (700/dia = 20 chips × 35, anti-ban WS2)
  const pctMeta = META_DISPAROS_DIA > 0 ? (mediaDisparosDia / META_DISPAROS_DIA) * 100 : 0;
  const corMeta = pctMeta >= 100 ? C.green : pctMeta >= 50 ? C.amber : C.red;
  const funilMacro = [
    { nome: "Disparos", v: totalGeralDisparos, cor: C.blue },
    { nome: "Responderam", v: totaisGerais.responderam, cor: C.pink },
    { nome: "Convertidos", v: totaisGerais.convertidos, cor: C.green },
  ];

  return (
    <div className="space-y-6">
      {/* Filtro */}
      <FiltroPeriodo
        dataInicio={dataInicio}
        dataFim={dataFim}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
      >
        <div className="flex-shrink-0">
          <Button type="button" variant="outline" onClick={handleLimparFiltros}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpar filtros
          </Button>
        </div>
      </FiltroPeriodo>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Send} label="Total disparos" value={totalGeralDisparos.toLocaleString()} color={C.blue} />
        <KPI icon={MessageCircle} label="Responderam (todos canais)" value={totaisGerais.responderam.toLocaleString()} sub={`${taxaResp}%`} color={C.pink} />
        <KPI icon={Trophy} label="Convertidos (todos canais)" value={totaisGerais.convertidos.toLocaleString()} sub={`${taxaConv}%`} color={C.green} />
        <KPI icon={Megaphone} label="Tráfego pago — enviados" value={totaisTrafego.enviados.toLocaleString()} color={C.amber} />
        <KPI icon={Mail} label="Emails enviados" value={metricasPorCanal.email.enviados.toLocaleString()} color={C.blue} />
        <KPI icon={Instagram} label="Instagram" value={metricasPorCanal.instagram.enviados.toLocaleString()} color={C.purple} />
      </div>

      {/* Sub-métricas de "Em Massa" + Última atualização */}
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2 px-1">
        <div className="text-xs flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="uppercase tracking-wide font-semibold text-foreground">Em massa:</span>
          <span><span className="font-semibold text-foreground">{(Number(totais.massa_enviados) || 0).toLocaleString()}</span> enviados</span>
          <span className="opacity-40">·</span>
          <span><span className="font-semibold text-foreground">{(Number(totais.massa_fila) || 0).toLocaleString()}</span> na fila</span>
          <span className="opacity-40">·</span>
          <span><span className="font-semibold text-foreground">{(Number(totais.massa_nozap) || 0).toLocaleString()}</span> sem WhatsApp</span>
          <span className="opacity-40">·</span>
          <span><span className="font-semibold text-foreground">{(Number(totais.massa_bloqueadas) || 0).toLocaleString()}</span> bloqueadas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Última atualização: {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-7 px-2">
            <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Tabs value={tabAtiva} onValueChange={setTabAtiva} className="space-y-4">
        <TabsList>
          {[
            ["resumo", "Resumo"],
            ["visao", "Visão geral"],
            ["especialidade", "Por especialidade"],
            ["conversao", "Conversão"],
            ["trafego", "Tráfego pago"],
            ["campanhas", "Campanhas"],
            ["propostas", "Propostas"],
            ["canais", "Canais"],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        {/* === Resumo executivo (diretoria) === */}
        <TabsContent value="resumo" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPI icon={Send} label="Disparos no período" value={totalGeralDisparos.toLocaleString()} sub={`~${mediaDisparosDia.toLocaleString()}/dia`} color={C.blue} />
            <KPI icon={MessageCircle} label="Taxa de resposta" value={`${taxaResp}%`} sub={`${totaisGerais.responderam.toLocaleString()} resp.`} color={C.pink} />
            <KPI icon={Trophy} label="Taxa de conversão" value={`${taxaConv}%`} sub={`${totaisGerais.convertidos.toLocaleString()} conv.`} color={C.green} />
            <KPI icon={Target} label="Ritmo vs meta" value={`${Math.round(pctMeta)}%`} sub={`meta ${META_DISPAROS_DIA}/dia`} color={corMeta} />
          </div>

          <PanelCard
            title="Ritmo de disparos por dia"
            description={`Média ${mediaDisparosDia.toLocaleString()}/dia · meta ${META_DISPAROS_DIA}/dia · verde = bateu a meta, vermelho = abaixo de 50%`}
            icon={BarChart3}
          >
            {serieDisparos.length === 0 ? (
              <p className="text-sm py-8 text-center text-muted-foreground">Sem disparos no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={serieDisparos}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="dia" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                  <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.06)" }} formatter={(v: any) => [Number(v).toLocaleString(), "Disparos"]} />
                  <ReferenceLine y={META_DISPAROS_DIA} stroke={C.amber} strokeDasharray="6 4" label={{ value: `meta ${META_DISPAROS_DIA}`, fill: C.amber, fontSize: 11, position: "insideTopRight" }} />
                  <Bar dataKey="disparos" name="Disparos" radius={[4, 4, 0, 0]}>
                    {serieDisparos.map((r, i) => (
                      <Cell key={i} fill={r.disparos >= META_DISPAROS_DIA ? C.green : r.disparos >= META_DISPAROS_DIA * 0.5 ? C.amber : C.red} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </PanelCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard title="Funil — disparo → resposta → conversão" description="Onde o lead avança e onde vaza" icon={TrendingUp}>
              <div className="space-y-3 pt-1">
                {funilMacro.map((e, i, arr) => {
                  const max = arr[0].v || 1;
                  const w = e.v > 0 ? Math.max(6, (e.v / max) * 100) : 0;
                  const passagem = i > 0 && arr[i - 1].v > 0 ? ((e.v / arr[i - 1].v) * 100).toFixed(1) : null;
                  return (
                    <div key={e.nome}>
                      <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-foreground">{e.nome}</span>
                        <span className="font-mono" style={{ color: e.cor }}>
                          {e.v.toLocaleString()}
                          {passagem && <span className="text-muted-foreground"> · {passagem}% da etapa anterior</span>}
                        </span>
                      </div>
                      <div className="h-6 rounded-md overflow-hidden bg-muted">
                        <div className="h-full rounded-md transition-all" style={{ width: `${w}%`, background: e.cor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </PanelCard>

            <PanelCard title="Produtividade do time" description="Top captadoras — volume enviado e conversões" icon={Users}>
              {topCaptadoras.length === 0 ? (
                <p className="text-sm py-8 text-center text-muted-foreground">Sem atividade por captadora ainda. Enche conforme a equipe trabalha os leads.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(240, topCaptadoras.length * 36)}>
                  <BarChart data={topCaptadoras} layout="vertical" margin={{ left: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                    <YAxis dataKey="nome" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={110} />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(22,163,74,0.06)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="enviados" fill={C.blue} name="Enviados" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="convertidos" fill={C.green} name="Convertidos" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </PanelCard>
          </div>
        </TabsContent>

        {/* === Visão geral === */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PanelCard title="Evolução mensal por tipo" description="Manual, em massa e tráfego pago" icon={BarChart3} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="mes" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                  <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="manual" stackId="a" fill={C.blue} name="Manual" />
                  <Bar dataKey="massa" stackId="a" fill={C.green} name="Em massa" />
                  <Bar dataKey="trafego" stackId="a" fill={C.amber} name="Tráfego pago" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </PanelCard>

            <PanelCard title="Mix por tipo" description="Distribuição no período">
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={resumoTipos} dataKey="total" nameKey="tipo" innerRadius={60} outerRadius={95} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                      {resumoTipos.map((_r, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [Number(v).toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-x-0 top-1/2 -translate-y-[60%] text-center pointer-events-none">
                  <div className="text-3xl font-bold">{totalGeralDisparos.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">total</div>
                </div>
              </div>
            </PanelCard>
          </div>

          <PanelCard title="Respostas e conversões — Tráfego pago" icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolucaoMensal}>
                <defs>
                  <linearGradient id="aEnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.amber} stopOpacity={0.4} /><stop offset="100%" stopColor={C.amber} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aResp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.pink} stopOpacity={0.4} /><stop offset="100%" stopColor={C.pink} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.4} /><stop offset="100%" stopColor={C.green} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="mes" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="trafego" stroke={C.amber} fill="url(#aEnv)" name="Enviados" strokeWidth={2} />
                <Area type="monotone" dataKey="respostas" stroke={C.pink} fill="url(#aResp)" name="Respostas" strokeWidth={2} />
                <Area type="monotone" dataKey="convertidos" stroke={C.green} fill="url(#aConv)" name="Convertidos" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Por Especialidade === */}
        <TabsContent value="especialidade" className="space-y-4">
          <PanelCard title="Disparos × Responderam × Convertidos por especialidade" description="Top 15 especialidades no período" icon={Stethoscope}>
            <ResponsiveContainer width="100%" height={Math.max(320, porEspecialidade.length * 36)}>
              <BarChart data={porEspecialidade} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <YAxis dataKey="especialidade" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={140} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="disparos" fill={C.blue} name="Disparos" radius={[0, 4, 4, 0]} />
                <Bar dataKey="responderam" fill={C.pink} name="Responderam" radius={[0, 4, 4, 0]} />
                <Bar dataKey="convertidos" fill={C.green} name="Convertidos" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </PanelCard>

          <PanelCard title="Detalhamento por especialidade">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    {["Especialidade", "Disparos", "Responderam", "Convertidos", "Taxa resp.", "Taxa conv."].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground ${i >= 1 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {porEspecialidade.map((r) => {
                    const tr = r.disparos > 0 ? ((r.responderam / r.disparos) * 100).toFixed(1) : "0";
                    const tc = r.disparos > 0 ? ((r.convertidos / r.disparos) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.especialidade} className="border-b hover:bg-muted/40 transition-colors">
                        <td className="py-2 px-2 font-medium">{r.especialidade}</td>
                        <td className="py-2 px-2 text-right" style={{ color: C.blue }}>{r.disparos.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: C.pink }}>{r.responderam.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: C.green }}>{r.convertidos.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{tr}%</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: C.amber }}>{tc}%</td>
                      </tr>
                    );
                  })}
                  {porEspecialidade.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem dados de especialidade no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Conversão === */}
        <TabsContent value="conversao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard title="Convertidos por colaborador" description="Leads com data_conversao no período" icon={UserCheck}>
              <ResponsiveContainer width="100%" height={Math.max(280, convPorColaborador.length * 36)}>
                <BarChart data={convPorColaborador} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                  <YAxis dataKey="nome" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={120} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(22,163,74,0.06)" }} />
                  <Bar dataKey="total" fill={C.green} name="Convertidos" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {convPorColaborador.length === 0 && <p className="text-sm py-4 text-center text-muted-foreground">Sem conversões no período.</p>}
            </PanelCard>

            <PanelCard title="Motivos de não conversão" description="Status: descartado, fechado, encerrado, não respondeu" icon={XCircle}>
              {motivosNaoConversao.length === 0 ? (
                <p className="text-sm py-8 text-center text-muted-foreground">Sem registros de não conversão no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={motivosNaoConversao} dataKey="total" nameKey="motivo" innerRadius={50} outerRadius={100} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                      {motivosNaoConversao.map((_r, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [Number(v).toLocaleString(), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </PanelCard>
          </div>

          <PanelCard title="Detalhamento dos motivos">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Motivo</th>
                    <th className="py-2 px-2 text-right text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Total</th>
                    <th className="py-2 px-2 text-right text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">%</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = motivosNaoConversao.reduce((s, r) => s + r.total, 0);
                    return motivosNaoConversao.map((r) => (
                      <tr key={r.motivo} className="border-b hover:bg-muted/40 transition-colors">
                        <td className="py-2 px-2 font-medium">{r.motivo}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: C.orange }}>{r.total.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{total > 0 ? ((r.total / total) * 100).toFixed(1) : "0"}%</td>
                      </tr>
                    ));
                  })()}
                  {motivosNaoConversao.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem motivos registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Tráfego pago === */}
        <TabsContent value="trafego" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI icon={Send} label="Enviados" value={totaisTrafego.enviados.toLocaleString()} color={C.blue} />
            <KPI icon={MessageCircle} label="Responderam" value={totaisTrafego.responderam.toLocaleString()} color={C.pink} />
            <KPI icon={Radio} label="Em conversa" value={totaisTrafego.emConversa.toLocaleString()} color={C.amber} />
            <KPI icon={MousePointer} label="Aceitaram" value={totaisTrafego.aceitaram.toLocaleString()} color={C.cyan} />
            <KPI icon={Trophy} label="Convertidos" value={totaisTrafego.convertidos.toLocaleString()} color={C.green} />
          </div>

          <PanelCard title="Funil de conversão por proposta" description="Top 8 propostas com tráfego pago">
            <ResponsiveContainer width="100%" height={Math.max(280, topPropostas.length * 40)}>
              <BarChart data={topPropostas} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <YAxis dataKey="proposta_codigo" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={100} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(217,119,6,0.06)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total_enviados" fill={C.blue} name="Enviados" radius={[0, 4, 4, 0]} />
                <Bar dataKey="total_responderam" fill={C.pink} name="Responderam" radius={[0, 4, 4, 0]} />
                <Bar dataKey="total_convertidos" fill={C.green} name="Convertidos" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Campanhas === */}
        <TabsContent value="campanhas" className="space-y-4">
          <PanelCard title="Top campanhas por conversão">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    {["Campanha", "Status", "Leads", "Contatados", "Em conversa", "Convertidos", "Taxa conv."].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCampanhas.map((c) => (
                    <tr key={c.campanha_id} className="border-b hover:bg-muted/40 transition-colors">
                      <td className="py-2 px-2 font-medium">{c.campanha_nome}</td>
                      <td className="py-2 px-2"><Badge variant="outline">{c.campanha_status}</Badge></td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{Number(c.total_leads).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{Number(c.contatados).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{Number(c.em_conversa).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-bold" style={{ color: C.green }}>{Number(c.convertidos).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: C.pink }}>{Number(c.taxa_conversao_pct ?? 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {topCampanhas.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Sem campanhas no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Propostas === */}
        <TabsContent value="propostas" className="space-y-4">
          <PanelCard title="Conversões por proposta — Tráfego pago" description="Quais propostas e campanhas estão convertendo">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    {["Proposta", "Campanha", "Enviados", "Responderam", "Em conversa", "Aceitaram", "Convertidos", "Conv. %"].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(trafegoPago ?? []).map((r: any) => {
                    const env = Number(r.total_enviados) || 0;
                    const conv = Number(r.total_convertidos) || 0;
                    const pct = env > 0 ? ((conv / env) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.campanha_proposta_id} className="border-b hover:bg-muted/40 transition-colors">
                        <td className="py-2 px-2 font-medium">{r.proposta_codigo}</td>
                        <td className="py-2 px-2 text-muted-foreground">{r.campanha_nome}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{env.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: C.pink }}>{Number(r.total_responderam).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{Number(r.total_em_conversa).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: C.cyan }}>{Number(r.total_aceitaram).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: C.green }}>{conv.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: C.amber }}>{pct}%</td>
                      </tr>
                    );
                  })}
                  {(trafegoPago ?? []).length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem propostas com tráfego pago no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Canais & instâncias === */}
        <TabsContent value="canais" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { tipo: "WhatsApp / SigZap", icon: MessageSquare, cor: C.green, m: metricasPorCanal.whatsapp },
              { tipo: "Email", icon: Mail, cor: C.blue, m: metricasPorCanal.email },
              { tipo: "Tráfego Pago", icon: Megaphone, cor: C.amber, m: metricasPorCanal.trafego },
              { tipo: "Instagram", icon: Instagram, cor: C.purple, m: metricasPorCanal.instagram },
            ].map(({ tipo, icon: Icon, cor, m }) => {
              const tr = m.enviados > 0 ? ((m.responderam / m.enviados) * 100).toFixed(1) : "0";
              const tc = m.enviados > 0 ? ((m.convertidos / m.enviados) * 100).toFixed(1) : "0";
              const semDados = m.enviados === 0 && m.responderam === 0 && m.convertidos === 0;
              return (
                <Card key={tipo}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="p-1.5 rounded-md" style={{ background: `${cor}1a`, color: cor }}><Icon className="h-4 w-4" /></span>
                      <span className="text-sm uppercase tracking-wider font-semibold">{tipo}</span>
                    </div>
                    {semDados ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                        <Inbox className="h-6 w-6 text-muted-foreground/50" />
                        <p className="text-xs text-muted-foreground">Canal ainda não tem dados no período</p>
                      </div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">{m.enviados.toLocaleString()}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">enviados</div>
                        <div className="mt-4 space-y-2 pt-3 border-t">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Responderam</span>
                            <span className="font-mono" style={{ color: C.pink }}>{m.responderam.toLocaleString()} <span className="text-xs opacity-70">({tr}%)</span></span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Convertidos</span>
                            <span className="font-mono font-bold" style={{ color: C.green }}>{m.convertidos.toLocaleString()} <span className="text-xs opacity-70">({tc}%)</span></span>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PanelCard title="Instâncias de tráfego pago" description="Chips marcados como tráfego pago" icon={Radio}>
            {chipsTrafego.length === 0 ? (
              <p className="text-sm py-4 text-center text-muted-foreground">
                Nenhuma instância marcada como tráfego pago. Marque instâncias em Configurações → Instâncias.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {chipsTrafego.map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.nome}</div>
                      <div className="text-xs text-muted-foreground">{c.tipo_instancia ?? "—"}</div>
                    </div>
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">TRÁFEGO</Badge>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
