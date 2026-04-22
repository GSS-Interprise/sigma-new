import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, MessageCircle, Trophy, TrendingUp, Megaphone, Users, Target, Radio, MousePointer, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(142 70% 45%)", "hsl(38 92% 50%)", "hsl(220 90% 56%)", "hsl(280 70% 55%)", "hsl(0 75% 55%)"];

function startOfMonthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function KPI({ icon: Icon, label, value, sub, color = "text-primary" }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-5 w-5 ${color}`} />
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
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
      const { data, error } = await (supabase as any)
        .from("disparo_manual_envios")
        .select("created_at,status")
        .gte("created_at", `${dataInicio}T00:00:00`)
        .lte("created_at", `${dataFim}T23:59:59`);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Disparos em massa (disparos_contatos)
  const { data: disparosMassa, isLoading: ldz } = useQuery({
    queryKey: ["bi-prospec-massa", dataInicio, dataFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("disparos_contatos")
        .select("data_envio,status,campanha_id,created_at")
        .gte("created_at", `${dataInicio}T00:00:00`)
        .lte("created_at", `${dataFim}T23:59:59`)
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as any[];
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
    <div className="space-y-6">
      {/* Filtro */}
      <FiltroPeriodo
        dataInicio={dataInicio}
        dataFim={dataFim}
        onDataInicioChange={setDataInicio}
        onDataFimChange={setDataFim}
      />

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI icon={Send} label="Total disparos" value={totalGeralDisparos.toLocaleString()} color="text-primary" />
        <KPI icon={Megaphone} label="Tráfego pago — enviados" value={totaisTrafego.enviados.toLocaleString()} color="text-amber-600" />
        <KPI icon={MessageCircle} label="Responderam (tráfego)" value={totaisTrafego.responderam.toLocaleString()} sub={`${taxaResp}%`} color="text-purple-600" />
        <KPI icon={Trophy} label="Convertidos (tráfego)" value={totaisTrafego.convertidos.toLocaleString()} sub={`${taxaConv}%`} color="text-emerald-600" />
        <KPI icon={Users} label="Leads em campanhas" value={totaisCampanhas.leads.toLocaleString()} color="text-blue-600" />
        <KPI icon={Target} label="Convertidos (campanhas)" value={totaisCampanhas.convertidos.toLocaleString()} color="text-green-600" />
      </div>

      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList>
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="trafego">Tráfego pago</TabsTrigger>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="canais">Canais & instâncias</TabsTrigger>
        </TabsList>

        {/* === Visão geral === */}
        <TabsContent value="visao" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5" /> Evolução mensal por tipo
                </CardTitle>
                <CardDescription>Manual, em massa e tráfego pago — respostas e conversões</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={evolucaoMensal}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mes" className="text-xs" />
                    <YAxis className="text-xs" />
                    <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="manual" stackId="a" fill={COLORS[0]} name="Manual" />
                    <Bar dataKey="massa" stackId="a" fill={COLORS[1]} name="Em massa" />
                    <Bar dataKey="trafego" stackId="a" fill={COLORS[2]} name="Tráfego pago" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Mix por tipo de disparo</CardTitle>
                <CardDescription>Distribuição no período</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={resumoTipos} dataKey="total" nameKey="tipo" outerRadius={90} label={(e: any) => `${e.tipo}: ${e.total}`}>
                      {resumoTipos.map((r, i) => <Cell key={i} fill={r.cor} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" /> Respostas e conversões — Tráfego pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mes" className="text-xs" />
                  <YAxis className="text-xs" />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="trafego" stroke={COLORS[2]} name="Enviados" strokeWidth={2} />
                  <Line type="monotone" dataKey="respostas" stroke={COLORS[3]} name="Respostas" strokeWidth={2} />
                  <Line type="monotone" dataKey="convertidos" stroke={COLORS[1]} name="Convertidos" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Tráfego pago === */}
        <TabsContent value="trafego" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPI icon={Send} label="Enviados (XLSX)" value={totaisTrafego.enviados.toLocaleString()} color="text-blue-600" />
            <KPI icon={MessageCircle} label="Responderam" value={totaisTrafego.responderam.toLocaleString()} color="text-purple-600" />
            <KPI icon={Radio} label="Em conversa" value={totaisTrafego.emConversa.toLocaleString()} color="text-amber-600" />
            <KPI icon={MousePointer} label="Aceitaram" value={totaisTrafego.aceitaram.toLocaleString()} color="text-green-600" />
            <KPI icon={Trophy} label="Convertidos" value={totaisTrafego.convertidos.toLocaleString()} color="text-emerald-600" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Funil de conversão por proposta</CardTitle>
              <CardDescription>Top 8 propostas com tráfego pago no período</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(280, topPropostas.length * 40)}>
                <BarChart data={topPropostas} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="proposta_codigo" type="category" className="text-xs" width={100} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="total_enviados" fill={COLORS[0]} name="Enviados" />
                  <Bar dataKey="total_responderam" fill={COLORS[3]} name="Responderam" />
                  <Bar dataKey="total_convertidos" fill={COLORS[1]} name="Convertidos" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Campanhas === */}
        <TabsContent value="campanhas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top campanhas por conversão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="py-2 px-2">Campanha</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2 text-right">Leads</th>
                      <th className="py-2 px-2 text-right">Contatados</th>
                      <th className="py-2 px-2 text-right">Em conversa</th>
                      <th className="py-2 px-2 text-right">Quentes</th>
                      <th className="py-2 px-2 text-right">Convertidos</th>
                      <th className="py-2 px-2 text-right">Taxa conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampanhas.map((c) => (
                      <tr key={c.campanha_id} className="border-b hover:bg-muted/40">
                        <td className="py-2 px-2 font-medium">{c.campanha_nome}</td>
                        <td className="py-2 px-2"><Badge variant="outline">{c.campanha_status}</Badge></td>
                        <td className="py-2 px-2 text-right">{Number(c.total_leads).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">{Number(c.contatados).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">{Number(c.em_conversa).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">{Number(c.quentes).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-semibold">{Number(c.convertidos).toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">{Number(c.taxa_conversao_pct ?? 0).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {topCampanhas.length === 0 && (
                      <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem campanhas no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Propostas === */}
        <TabsContent value="propostas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversões por proposta — Tráfego pago</CardTitle>
              <CardDescription>Quais propostas e campanhas estão convertendo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="py-2 px-2">Proposta</th>
                      <th className="py-2 px-2">Campanha</th>
                      <th className="py-2 px-2 text-right">Enviados</th>
                      <th className="py-2 px-2 text-right">Responderam</th>
                      <th className="py-2 px-2 text-right">Em conversa</th>
                      <th className="py-2 px-2 text-right">Aceitaram</th>
                      <th className="py-2 px-2 text-right">Convertidos</th>
                      <th className="py-2 px-2 text-right">Conv. %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(trafegoPago ?? []).map((r: any) => {
                      const env = Number(r.total_enviados) || 0;
                      const conv = Number(r.total_convertidos) || 0;
                      const pct = env > 0 ? ((conv / env) * 100).toFixed(1) : "0";
                      return (
                        <tr key={r.campanha_proposta_id} className="border-b hover:bg-muted/40">
                          <td className="py-2 px-2 font-medium">{r.proposta_codigo}</td>
                          <td className="py-2 px-2 text-muted-foreground">{r.campanha_nome}</td>
                          <td className="py-2 px-2 text-right">{env.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{Number(r.total_responderam).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{Number(r.total_em_conversa).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{Number(r.total_aceitaram).toLocaleString()}</td>
                          <td className="py-2 px-2 text-right font-semibold">{conv.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{pct}%</td>
                        </tr>
                      );
                    })}
                    {(trafegoPago ?? []).length === 0 && (
                      <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sem propostas com tráfego pago no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Canais & instâncias === */}
        <TabsContent value="canais" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {resumoTipos.map((r) => (
              <Card key={r.tipo}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.tipo}</span>
                    <Badge style={{ backgroundColor: r.cor }} className="text-white border-0">
                      {totalGeralDisparos > 0 ? ((r.total / totalGeralDisparos) * 100).toFixed(1) : 0}%
                    </Badge>
                  </div>
                  <div className="text-3xl font-bold mt-2">{r.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">disparos no período</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Radio className="h-5 w-5" /> Instâncias de tráfego pago
              </CardTitle>
              <CardDescription>Chips marcados como tráfego pago</CardDescription>
            </CardHeader>
            <CardContent>
              {chipsTrafego.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
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
                      <Badge className="bg-amber-600 text-white border-0">Tráfego pago</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
