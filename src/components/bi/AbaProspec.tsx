import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, Trophy, TrendingUp, Megaphone, Users, Target, Radio, MousePointer, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// Paleta neon (cyan, magenta, amarelo, verde, laranja, roxo)
const NEON = {
  cyan: "#22d3ee",
  magenta: "#ec4899",
  yellow: "#facc15",
  green: "#22c55e",
  orange: "#fb923c",
  purple: "#a855f7",
  blue: "#3b82f6",
};
const COLORS = [NEON.cyan, NEON.green, NEON.yellow, NEON.magenta, NEON.purple, NEON.orange];

const tooltipStyle = {
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  border: "1px solid rgba(34, 211, 238, 0.4)",
  borderRadius: 8,
  color: "#e2e8f0",
  boxShadow: "0 0 20px rgba(34,211,238,0.15)",
};
const tooltipItemStyle = { color: "#e2e8f0" };
const tooltipLabelStyle = { color: "#94a3b8", fontSize: 11, marginBottom: 4 };

function startOfMonthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Busca paginada em chunks de 1000 (limite default do Supabase)
async function fetchAllChunks<T = any>(
  table: string,
  select: string,
  applyFilters: (q: any) => any,
  chunkSize = 1000,
  maxRows = 50000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = from + chunkSize - 1;
    let q: any = (supabase as any).from(table).select(select).range(from, to);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < chunkSize) break;
    from += chunkSize;
  }
  return all;
}

function KPI({ icon: Icon, label, value, sub, color = NEON.cyan }: any) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-4 backdrop-blur-sm transition-transform hover:scale-[1.02]"
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))",
        borderColor: `${color}55`,
        boxShadow: `0 0 24px ${color}22, inset 0 0 12px ${color}11`,
      }}
    >
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-30 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between mb-2 relative">
        <div className="p-1.5 rounded-md" style={{ background: `${color}22`, border: `1px solid ${color}55` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        {sub && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded" style={{ background: `${color}22`, color }}>
            {sub}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold relative tracking-tight" style={{ color: "#f1f5f9", textShadow: `0 0 8px ${color}66` }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wider mt-1 relative" style={{ color: "#94a3b8" }}>
        {label}
      </div>
    </div>
  );
}

function PanelCard({ title, description, icon: Icon, accent = NEON.cyan, children, className = "" }: any) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border backdrop-blur-sm ${className}`}
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))",
        borderColor: `${accent}44`,
        boxShadow: `0 0 18px ${accent}15`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
      <div className="p-4 border-b" style={{ borderColor: `${accent}22` }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" style={{ color: accent }} />}
          <h3 className="text-sm font-semibold tracking-wide uppercase" style={{ color: "#e2e8f0" }}>{title}</h3>
        </div>
        {description && <p className="text-xs mt-1" style={{ color: "#64748b" }}>{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function AbaProspec() {
  const [dataInicio, setDataInicio] = useState(startOfMonthsAgo(5));
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  // Funil tráfego pago — agregando vw_trafego_pago_funil
  const { data: trafegoPago, isLoading: lt } = useQuery({
    queryKey: ["bi-prospec-trafego", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_trafego_pago_funil")
        .select("*")
        .gte("primeiro_envio", `${dataInicio}T00:00:00`)
        .lte("primeiro_envio", `${dataFim}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Métricas de campanhas
  const { data: campanhasMetricas, isLoading: lc } = useQuery({
    queryKey: ["bi-prospec-campanhas", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_campanha_metricas")
        .select("*")
        .gte("campanha_criada_em", `${dataInicio}T00:00:00`)
        .lte("campanha_criada_em", `${dataFim}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Disparos manuais por mês
  const { data: disparosManuais, isLoading: ldm } = useQuery({
    queryKey: ["bi-prospec-manuais", dataInicio, dataFim],
    queryFn: async () => {
      return await fetchAllChunks<any>(
        "disparo_manual_envios",
        "created_at,status",
        (q) => q
          .gte("created_at", `${dataInicio}T00:00:00`)
          .lte("created_at", `${dataFim}T23:59:59`)
      );
    },
  });

  // Disparos em massa (disparos_contatos)
  const { data: disparosMassa, isLoading: ldz } = useQuery({
    queryKey: ["bi-prospec-massa", dataInicio, dataFim],
    queryFn: async () => {
      return await fetchAllChunks<any>(
        "disparos_contatos",
        "data_envio,status,campanha_id,created_at",
        (q) => q
          .gte("created_at", `${dataInicio}T00:00:00`)
          .lte("created_at", `${dataFim}T23:59:59`)
      );
    },
  });

  // Chips de tráfego pago
  const { data: chips } = useQuery({
    queryKey: ["bi-prospec-chips"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chips")
        .select("id,nome,is_trafego_pago,tipo_instancia");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const isLoading = lt || lc || ldm || ldz;

  // ---- Agregações ----
  const totaisTrafego = useMemo(() => {
    const arr = trafegoPago ?? [];
    return arr.reduce(
      (acc, r) => ({
        enviados: acc.enviados + (Number(r.total_enviados) || 0),
        responderam: acc.responderam + (Number(r.total_responderam) || 0),
        emConversa: acc.emConversa + (Number(r.total_em_conversa) || 0),
        aceitaram: acc.aceitaram + (Number(r.total_aceitaram) || 0),
        convertidos: acc.convertidos + (Number(r.total_convertidos) || 0),
      }),
      { enviados: 0, responderam: 0, emConversa: 0, aceitaram: 0, convertidos: 0 }
    );
  }, [trafegoPago]);

  const totaisCampanhas = useMemo(() => {
    const arr = campanhasMetricas ?? [];
    return arr.reduce(
      (acc, r) => ({
        leads: acc.leads + (Number(r.total_leads) || 0),
        contatados: acc.contatados + (Number(r.contatados) || 0),
        emConversa: acc.emConversa + (Number(r.em_conversa) || 0),
        quentes: acc.quentes + (Number(r.quentes) || 0),
        convertidos: acc.convertidos + (Number(r.convertidos) || 0),
        disparados: acc.disparados + (Number(r.disparados) || 0),
      }),
      { leads: 0, contatados: 0, emConversa: 0, quentes: 0, convertidos: 0, disparados: 0 }
    );
  }, [campanhasMetricas]);

  // Evolução por mês — combina manuais + massa + tráfego
  const evolucaoMensal = useMemo(() => {
    const map: Record<string, { mes: string; manual: number; massa: number; trafego: number; respostas: number; convertidos: number }> = {};
    const ensure = (k: string) => (map[k] ??= { mes: k, manual: 0, massa: 0, trafego: 0, respostas: 0, convertidos: 0 });

    (disparosManuais ?? []).forEach((r) => {
      const k = (r.created_at || "").slice(0, 7);
      if (k) ensure(k).manual += 1;
    });
    (disparosMassa ?? []).forEach((r) => {
      const k = (r.created_at || r.data_envio || "").slice(0, 7);
      if (k) ensure(k).massa += 1;
    });
    (trafegoPago ?? []).forEach((r) => {
      const k = (r.primeiro_envio || "").slice(0, 7);
      if (!k) return;
      const e = ensure(k);
      e.trafego += Number(r.total_enviados) || 0;
      e.respostas += Number(r.total_responderam) || 0;
      e.convertidos += Number(r.total_convertidos) || 0;
    });

    return Object.values(map).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [disparosManuais, disparosMassa, trafegoPago]);

  // Resumo por tipo de disparo
  const resumoTipos = useMemo(() => {
    const manual = (disparosManuais ?? []).length;
    const massa = (disparosMassa ?? []).length;
    const trafego = totaisTrafego.enviados;
    return [
      { tipo: "Manual", total: manual, cor: COLORS[0] },
      { tipo: "Em Massa", total: massa, cor: COLORS[1] },
      { tipo: "Tráfego Pago", total: trafego, cor: COLORS[2] },
    ];
  }, [disparosManuais, disparosMassa, totaisTrafego]);

  const totalGeralDisparos = resumoTipos.reduce((s, r) => s + r.total, 0);

  // Top campanhas por conversão
  const topCampanhas = useMemo(() => {
    return [...(campanhasMetricas ?? [])]
      .sort((a, b) => (Number(b.convertidos) || 0) - (Number(a.convertidos) || 0))
      .slice(0, 8);
  }, [campanhasMetricas]);

  // Top propostas (tráfego pago)
  const topPropostas = useMemo(() => {
    return [...(trafegoPago ?? [])]
      .sort((a, b) => (Number(b.total_convertidos) || 0) - (Number(a.total_convertidos) || 0))
      .slice(0, 8);
  }, [trafegoPago]);

  const chipsTrafego = (chips ?? []).filter((c) => c.is_trafego_pago);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const taxaResp = totaisTrafego.enviados > 0 ? ((totaisTrafego.responderam / totaisTrafego.enviados) * 100).toFixed(1) : "0";
  const taxaConv = totaisTrafego.enviados > 0 ? ((totaisTrafego.convertidos / totaisTrafego.enviados) * 100).toFixed(1) : "0";

  return (
    <div
      className="space-y-6 -m-4 p-4 md:p-6 min-h-[calc(100vh-8rem)] rounded-lg"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.08), transparent 50%), radial-gradient(circle at 80% 100%, rgba(236,72,153,0.08), transparent 50%), #020617",
      }}
    >
      {/* Filtro */}
      <FiltroPeriodo
        dataInicio={dataInicio}
        dataFim={dataFim}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
      />

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Send} label="Total disparos" value={totalGeralDisparos.toLocaleString()} color={NEON.cyan} />
        <KPI icon={Megaphone} label="Tráfego — enviados" value={totaisTrafego.enviados.toLocaleString()} color={NEON.yellow} />
        <KPI icon={MessageCircle} label="Responderam" value={totaisTrafego.responderam.toLocaleString()} sub={`${taxaResp}%`} color={NEON.magenta} />
        <KPI icon={Trophy} label="Convertidos" value={totaisTrafego.convertidos.toLocaleString()} sub={`${taxaConv}%`} color={NEON.green} />
        <KPI icon={Users} label="Leads campanhas" value={totaisCampanhas.leads.toLocaleString()} color={NEON.blue} />
        <KPI icon={Target} label="Conv. campanhas" value={totaisCampanhas.convertidos.toLocaleString()} color={NEON.purple} />
      </div>

      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList
          className="bg-transparent border p-1 gap-1"
          style={{ borderColor: `${NEON.cyan}33`, background: "rgba(15,23,42,0.6)" }}
        >
          {[
            ["visao", "Visão geral"],
            ["trafego", "Tráfego pago"],
            ["campanhas", "Campanhas"],
            ["propostas", "Propostas"],
            ["canais", "Canais"],
          ].map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v}
              className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-300 data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.4)] text-slate-400"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* === Visão geral === */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PanelCard title="Evolução mensal por tipo" description="Manual, em massa e tráfego pago" icon={BarChart3} accent={NEON.cyan} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={evolucaoMensal}>
                  <defs>
                    <linearGradient id="gManual" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.cyan} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.cyan} stopOpacity={0.4} /></linearGradient>
                    <linearGradient id="gMassa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.green} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.green} stopOpacity={0.4} /></linearGradient>
                    <linearGradient id="gTraf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.yellow} stopOpacity={0.95} /><stop offset="100%" stopColor={NEON.yellow} stopOpacity={0.4} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="mes" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(34,211,238,0.05)" }} />
                  <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  <Bar dataKey="manual" stackId="a" fill="url(#gManual)" name="Manual" radius={[0,0,0,0]} />
                  <Bar dataKey="massa" stackId="a" fill="url(#gMassa)" name="Em massa" />
                  <Bar dataKey="trafego" stackId="a" fill="url(#gTraf)" name="Tráfego pago" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </PanelCard>

            <PanelCard title="Mix por tipo" description="Distribuição no período" accent={NEON.magenta}>
              <div className="relative">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={resumoTipos}
                      dataKey="total"
                      nameKey="tipo"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      stroke="#020617"
                      strokeWidth={2}
                    >
                      {resumoTipos.map((_r, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      itemStyle={tooltipItemStyle}
                      labelStyle={tooltipLabelStyle}
                      formatter={(v: any, n: any) => [Number(v).toLocaleString(), n]}
                    />
                    <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-[60%] text-center pointer-events-none"
                >
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "#f1f5f9", textShadow: `0 0 10px ${NEON.magenta}66` }}
                  >
                    {totalGeralDisparos.toLocaleString()}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: "#94a3b8" }}>total</div>
                </div>
              </div>
            </PanelCard>
          </div>

          <PanelCard title="Respostas e conversões — Tráfego pago" icon={TrendingUp} accent={NEON.green}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolucaoMensal}>
                <defs>
                  <linearGradient id="aEnv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.yellow} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.yellow} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aResp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.magenta} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.magenta} stopOpacity={0} /></linearGradient>
                  <linearGradient id="aConv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NEON.green} stopOpacity={0.6} /><stop offset="100%" stopColor={NEON.green} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="mes" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Area type="monotone" dataKey="trafego" stroke={NEON.yellow} fill="url(#aEnv)" name="Enviados" strokeWidth={2} />
                <Area type="monotone" dataKey="respostas" stroke={NEON.magenta} fill="url(#aResp)" name="Respostas" strokeWidth={2} />
                <Area type="monotone" dataKey="convertidos" stroke={NEON.green} fill="url(#aConv)" name="Convertidos" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Tráfego pago === */}
        <TabsContent value="trafego" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI icon={Send} label="Enviados" value={totaisTrafego.enviados.toLocaleString()} color={NEON.blue} />
            <KPI icon={MessageCircle} label="Responderam" value={totaisTrafego.responderam.toLocaleString()} color={NEON.magenta} />
            <KPI icon={Radio} label="Em conversa" value={totaisTrafego.emConversa.toLocaleString()} color={NEON.yellow} />
            <KPI icon={MousePointer} label="Aceitaram" value={totaisTrafego.aceitaram.toLocaleString()} color={NEON.cyan} />
            <KPI icon={Trophy} label="Convertidos" value={totaisTrafego.convertidos.toLocaleString()} color={NEON.green} />
          </div>

          <PanelCard title="Funil de conversão por proposta" description="Top 8 propostas com tráfego pago" accent={NEON.yellow}>
            <ResponsiveContainer width="100%" height={Math.max(280, topPropostas.length * 40)}>
              <BarChart data={topPropostas} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis dataKey="proposta_codigo" type="category" stroke="#64748b" tick={{ fill: "#cbd5e1", fontSize: 11 }} width={100} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(250,204,21,0.05)" }} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
                <Bar dataKey="total_enviados" fill={NEON.cyan} name="Enviados" radius={[0,4,4,0]} />
                <Bar dataKey="total_responderam" fill={NEON.magenta} name="Responderam" radius={[0,4,4,0]} />
                <Bar dataKey="total_convertidos" fill={NEON.green} name="Convertidos" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </PanelCard>
        </TabsContent>

        {/* === Campanhas === */}
        <TabsContent value="campanhas" className="space-y-4">
          <PanelCard title="Top campanhas por conversão" accent={NEON.cyan}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.cyan}33` }}>
                    {["Campanha","Status","Leads","Contatados","Em conversa","Quentes","Convertidos","Taxa conv."].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold ${i>=2?"text-right":""}`} style={{ color: NEON.cyan }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCampanhas.map((c) => (
                    <tr key={c.campanha_id} className="border-b transition-colors hover:bg-cyan-500/5" style={{ borderColor: "#1e293b" }}>
                      <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{c.campanha_nome}</td>
                      <td className="py-2 px-2"><Badge variant="outline" className="border-cyan-500/40 text-cyan-300">{c.campanha_status}</Badge></td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.total_leads).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.contatados).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(c.em_conversa).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right" style={{ color: NEON.yellow }}>{Number(c.quentes).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}55` }}>{Number(c.convertidos).toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: NEON.magenta }}>{Number(c.taxa_conversao_pct ?? 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {topCampanhas.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center" style={{ color: "#64748b" }}>Sem campanhas no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Propostas === */}
        <TabsContent value="propostas" className="space-y-4">
          <PanelCard title="Conversões por proposta — Tráfego pago" description="Quais propostas e campanhas estão convertendo" accent={NEON.green}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b" style={{ borderColor: `${NEON.green}33` }}>
                    {["Proposta","Campanha","Enviados","Responderam","Em conversa","Aceitaram","Convertidos","Conv. %"].map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-[11px] uppercase tracking-wider font-semibold ${i>=2?"text-right":""}`} style={{ color: NEON.green }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(trafegoPago ?? []).map((r: any) => {
                    const env = Number(r.total_enviados) || 0;
                    const conv = Number(r.total_convertidos) || 0;
                    const pct = env > 0 ? ((conv / env) * 100).toFixed(1) : "0";
                    return (
                      <tr key={r.campanha_proposta_id} className="border-b hover:bg-green-500/5 transition-colors" style={{ borderColor: "#1e293b" }}>
                        <td className="py-2 px-2 font-medium" style={{ color: "#e2e8f0" }}>{r.proposta_codigo}</td>
                        <td className="py-2 px-2" style={{ color: "#94a3b8" }}>{r.campanha_nome}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{env.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.magenta }}>{Number(r.total_responderam).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: "#cbd5e1" }}>{Number(r.total_em_conversa).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right" style={{ color: NEON.cyan }}>{Number(r.total_aceitaram).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: NEON.green, textShadow: `0 0 6px ${NEON.green}55` }}>{conv.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono" style={{ color: NEON.yellow }}>{pct}%</td>
                      </tr>
                    );
                  })}
                  {(trafegoPago ?? []).length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center" style={{ color: "#64748b" }}>Sem propostas com tráfego pago no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </PanelCard>
        </TabsContent>

        {/* === Canais & instâncias === */}
        <TabsContent value="canais" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resumoTipos.map((r, i) => {
              const cor = COLORS[i % COLORS.length];
              const pct = totalGeralDisparos > 0 ? (r.total / totalGeralDisparos) * 100 : 0;
              return (
                <div key={r.tipo} className="relative overflow-hidden rounded-xl border p-5 backdrop-blur-sm"
                  style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.85), rgba(2,6,23,0.95))", borderColor: `${cor}55`, boxShadow: `0 0 24px ${cor}22` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm uppercase tracking-wider" style={{ color: "#94a3b8" }}>{r.tipo}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: `${cor}22`, color: cor }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="text-4xl font-bold mt-3" style={{ color: "#f1f5f9", textShadow: `0 0 10px ${cor}66` }}>{r.total.toLocaleString()}</div>
                  <div className="text-xs mt-1" style={{ color: "#64748b" }}>disparos no período</div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "#1e293b" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor, boxShadow: `0 0 8px ${cor}` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <PanelCard title="Instâncias de tráfego pago" description="Chips marcados como tráfego pago" icon={Radio} accent={NEON.yellow}>
            {chipsTrafego.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "#64748b" }}>
                Nenhuma instância marcada como tráfego pago. Marque instâncias em Configurações → Instâncias.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {chipsTrafego.map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 flex items-center justify-between"
                    style={{ borderColor: `${NEON.yellow}33`, background: "rgba(15,23,42,0.5)" }}>
                    <div>
                      <div className="font-medium" style={{ color: "#e2e8f0" }}>{c.nome}</div>
                      <div className="text-xs" style={{ color: "#64748b" }}>{c.tipo_instancia ?? "—"}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: `${NEON.yellow}22`, color: NEON.yellow, border: `1px solid ${NEON.yellow}55` }}>TRÁFEGO</span>
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
