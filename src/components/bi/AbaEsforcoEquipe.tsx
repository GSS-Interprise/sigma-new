import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, ListChecks, Clock, AlertTriangle, Target, Users, Phone,
  MessageCircle, Instagram, Mail, Megaphone,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";

const C = { blue: "#2563eb", green: "#16a34a", amber: "#d97706", red: "#dc2626", purple: "#7c3aed", cyan: "#0891b2", slate: "#64748b" };
const PIE = [C.green, C.blue, C.purple, C.cyan, C.amber];
const GRID = "#e2e8f0", AXIS = "#64748b";
const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

const CANAL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", ligacao: "Ligação", instagram: "Instagram", email: "E-mail" };
const CANAL_ICON: Record<string, any> = { whatsapp: MessageCircle, ligacao: Phone, instagram: Instagram, email: Mail };

type Resumo = { total: number; feitas: number; pendentes: number; atrasadas: number; descartadas: number; pct_conclusao: number };
type Campanha = { campanha: string; total: number; feitas: number; atrasadas: number; pendentes: number; descartadas: number; pct: number; leads: number; leads_trabalhados: number; cobertura_pct: number; leads_multicanal: number };
type Canal = { canal: string; total: number; feitas: number; atrasadas: number; pendentes: number };
type Pessoa = { pessoa: string; feitas: number; wpp: number; ligacao: number; instagram: number; email: number };
type Atrasada = { campanha: string; lead: string | null; tipo: string; dias: number };
type Payload = { resumo: Resumo; por_campanha: Campanha[]; por_canal: Canal[]; por_pessoa: Pessoa[]; atrasadas_top: Atrasada[] };

const PERIODOS = [
  { key: "tudo", label: "Tudo" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "mes", label: "Este mês" },
];

function desdeFrom(key: string): string | null {
  const now = new Date();
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
  if (key === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return null;
}

export function AbaEsforcoEquipe() {
  const [periodo, setPeriodo] = useState("tudo");

  const { data, isLoading } = useQuery({
    queryKey: ["bi-esforco-equipe", periodo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_esforco_equipe", { p_desde: desdeFrom(periodo) });
      if (error) throw error;
      return data as Payload;
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const { resumo, por_campanha, por_canal, por_pessoa, atrasadas_top } = data;
  const campData = por_campanha.map((c) => ({ ...c, nome: c.campanha.length > 22 ? c.campanha.slice(0, 22) + "…" : c.campanha }));
  const canalData = por_canal.map((c) => ({ ...c, label: CANAL_LABEL[c.canal] || c.canal }));

  return (
    <div className="space-y-4">
      {/* Período */}
      <div className="flex gap-2">
        {PERIODOS.map((p) => (
          <Button key={p.key} size="sm" variant={periodo === p.key ? "default" : "outline"} onClick={() => setPeriodo(p.key)}>{p.label}</Button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={ListChecks} label="Tarefas concluídas" value={resumo.feitas} color={C.green} />
        <KPI icon={Clock} label="Pendentes" value={resumo.pendentes} color={C.amber} />
        <KPI icon={AlertTriangle} label="Atrasadas" value={resumo.atrasadas} color={C.red} />
        <KPI icon={Target} label="% de conclusão" value={`${resumo.pct_conclusao}%`} color={C.blue} sub="das tarefas não descartadas" />
      </div>

      {/* Banner explicativo p/ gestão */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="py-3 text-sm text-slate-600 flex items-start gap-2">
          <Megaphone className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <span>
            Cada lead de campanha gera uma <b>cadência de tarefas</b> (WhatsApp, ligação, Instagram, e-mail). Aqui você vê
            <b> se a equipe executou cada uma</b>, quanto está <b>atrasado</b> e <b>quem insistiu por outros canais</b>.
            O ranking por pessoa preenche conforme a equipe marca as tarefas como feitas no Acompanhamento.
          </span>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tarefas por campanha (empilhado) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tarefas por campanha</CardTitle>
            <CardDescription>Concluídas × pendentes × atrasadas — onde a equipe está em dia ou travada</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="nome" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} width={140} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="feitas" name="Feitas" stackId="a" fill={C.green} radius={[0, 0, 0, 0]} />
                <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill={C.amber} />
                <Bar dataKey="atrasadas" name="Atrasadas" stackId="a" fill={C.red} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por canal */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Esforço por canal</CardTitle>
            <CardDescription>Distribuição das tarefas (insistência multicanal)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={canalData} dataKey="total" nameKey="label" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                  {canalData.map((_x, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cobertura por campanha — "chamaram todo mundo?" */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobertura e insistência por campanha</CardTitle>
          <CardDescription>"Chamaram todo mundo?" e "insistiram por outras vias?" — lead a lead</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Campanha</th>
                <th className="py-2 px-2 font-medium text-right">Leads</th>
                <th className="py-2 px-2 font-medium text-right">Trabalhados</th>
                <th className="py-2 px-2 font-medium text-right">Cobertura</th>
                <th className="py-2 px-2 font-medium text-right">Multicanal</th>
                <th className="py-2 px-2 font-medium text-right">Atrasadas</th>
                <th className="py-2 pl-2 font-medium text-right">% conclusão</th>
              </tr>
            </thead>
            <tbody>
              {por_campanha.map((c) => (
                <tr key={c.campanha} className="border-b last:border-0">
                  <td className="py-2 pr-3">{c.campanha}</td>
                  <td className="py-2 px-2 text-right">{c.leads}</td>
                  <td className="py-2 px-2 text-right">{c.leads_trabalhados}</td>
                  <td className="py-2 px-2 text-right">
                    <Badge variant={c.cobertura_pct >= 70 ? "default" : c.cobertura_pct >= 30 ? "secondary" : "outline"}>{c.cobertura_pct}%</Badge>
                  </td>
                  <td className="py-2 px-2 text-right">{c.leads_multicanal}</td>
                  <td className="py-2 px-2 text-right">{c.atrasadas > 0 ? <span className="text-red-600 font-medium">{c.atrasadas}</span> : "0"}</td>
                  <td className="py-2 pl-2 text-right">{c.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Ranking por pessoa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Quem concluiu as tarefas</CardTitle>
          <CardDescription>Ranking da equipe por tarefas marcadas como feitas (e por canal)</CardDescription>
        </CardHeader>
        <CardContent>
          {por_pessoa.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa concluída no período ainda.</p>
          ) : (
            <div className="space-y-2">
              {por_pessoa.map((p) => (
                <div key={p.pessoa} className="flex items-center justify-between border-b last:border-0 py-2">
                  <span className="font-medium">{p.pessoa}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <Canalzinho icon={MessageCircle} n={p.wpp} />
                    <Canalzinho icon={Phone} n={p.ligacao} />
                    <Canalzinho icon={Instagram} n={p.instagram} />
                    <Canalzinho icon={Mail} n={p.email} />
                    <Badge>{p.feitas} feitas</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atrasadas — a dor direta */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Tarefas atrasadas (top 50)</CardTitle>
          <CardDescription>O que não foi feito no prazo — onde cobrar</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {atrasadas_top.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa atrasada. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Campanha</th>
                  <th className="py-2 px-2 font-medium">Lead</th>
                  <th className="py-2 px-2 font-medium">Canal</th>
                  <th className="py-2 pl-2 font-medium text-right">Atraso</th>
                </tr>
              </thead>
              <tbody>
                {atrasadas_top.map((a, i) => {
                  const Icon = CANAL_ICON[a.tipo] || MessageCircle;
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3">{a.campanha}</td>
                      <td className="py-2 px-2">{a.lead || "—"}</td>
                      <td className="py-2 px-2"><span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" /> {CANAL_LABEL[a.tipo] || a.tipo}</span></td>
                      <td className="py-2 pl-2 text-right text-red-600 font-medium">{a.dias}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color, sub }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="p-2 rounded-lg" style={{ background: `${color}1a`, color }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
    </CardContent></Card>
  );
}

function Canalzinho({ icon: Icon, n }: { icon: any; n: number }) {
  return <span className="inline-flex items-center gap-1" title={`${n}`}><Icon className="h-3.5 w-3.5" /> {n}</span>;
}
