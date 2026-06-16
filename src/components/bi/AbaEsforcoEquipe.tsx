import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ListChecks, Clock, AlertTriangle, Target, Users, Megaphone,
  MessageCircle, Phone, Instagram, Mail, MapPin, Filter,
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

type Resumo = { total: number; feitas: number; pendentes: number; atrasadas: number; descartadas: number; pct_conclusao: number };
type Campanha = { campanha: string; campanha_id: string; total: number; feitas: number; atrasadas: number; pendentes: number; pct: number; leads: number; leads_trabalhados: number; cobertura_pct: number; leads_multicanal: number };
type Canal = { canal: string; total: number };
type Pessoa = { pessoa: string; feitas: number; wpp: number; ligacao: number; instagram: number; email: number };
type Overview = { resumo: Resumo; por_campanha: Campanha[]; por_canal: Canal[]; por_pessoa: Pessoa[] };

type Funil = {
  nome: string; tem_alvo_especialidade: boolean; universo_total: number;
  funil: { na_campanha: number; chamados: number; em_conversa: number; quente: number; convertido: number; descartado: number; sem_resposta: number };
  por_uf: { uf: string | null; disponiveis: number | null; na_campanha: number; chamados: number; cobertura_pct: number | null }[];
  tarefas: { feitas: number; pendentes: number; atrasadas: number };
};

const PERIODOS = [{ key: "tudo", label: "Tudo" }, { key: "30d", label: "Últimos 30 dias" }, { key: "mes", label: "Este mês" }];
function desdeFrom(key: string): string | null {
  const now = new Date();
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
  if (key === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return null;
}

export function AbaEsforcoEquipe() {
  const [periodo, setPeriodo] = useState("tudo");
  const [campanhaId, setCampanhaId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["bi-esforco-equipe", periodo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_esforco_equipe", { p_desde: desdeFrom(periodo) });
      if (error) throw error;
      return data as Overview;
    },
  });

  const { data: funil, isLoading: loadingFunil } = useQuery({
    queryKey: ["bi-funil-campanha", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_funil_campanha", { p_campanha_id: campanhaId });
      if (error) throw error;
      return data as Funil;
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const { resumo, por_campanha, por_canal, por_pessoa } = data;
  const campData = por_campanha.map((c) => ({ ...c, nome: c.campanha.length > 22 ? c.campanha.slice(0, 22) + "…" : c.campanha }));
  const canalData = por_canal.map((c) => ({ ...c, label: CANAL_LABEL[c.canal] || c.canal }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PERIODOS.map((p) => (
          <Button key={p.key} size="sm" variant={periodo === p.key ? "default" : "outline"} onClick={() => setPeriodo(p.key)}>{p.label}</Button>
        ))}
      </div>

      {/* KPIs gerais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={ListChecks} label="Tarefas concluídas" value={resumo.feitas} color={C.green} />
        <KPI icon={Clock} label="Pendentes" value={resumo.pendentes} color={C.amber} />
        <KPI icon={AlertTriangle} label="Atrasadas" value={resumo.atrasadas} color={C.red} />
        <KPI icon={Target} label="% de conclusão" value={`${resumo.pct_conclusao}%`} color={C.blue} sub="das tarefas não descartadas" />
      </div>

      {/* ===== Funil de cobertura por campanha ===== */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Filter className="h-4 w-4 text-blue-600" /> Funil de cobertura por campanha</CardTitle>
          <CardDescription>"Já chamamos todos os médicos daquela região?" — escolha uma campanha</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={campanhaId} onValueChange={setCampanhaId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Selecione uma campanha…" /></SelectTrigger>
            <SelectContent>
              {por_campanha.map((c) => <SelectItem key={c.campanha_id} value={c.campanha_id}>{c.campanha}</SelectItem>)}
            </SelectContent>
          </Select>

          {!campanhaId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Escolha uma campanha pra ver o funil e a cobertura por região.</p>
          ) : loadingFunil || !funil ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <FunilCampanha funil={funil} />
          )}
        </CardContent>
      </Card>

      {/* Visão geral: tarefas por campanha + canal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <Bar dataKey="feitas" name="Feitas" stackId="a" fill={C.green} />
                <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill={C.amber} />
                <Bar dataKey="atrasadas" name="Atrasadas" stackId="a" fill={C.red} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

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

      {/* Cobertura por campanha (visão rápida) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobertura e insistência por campanha</CardTitle>
          <CardDescription>"Chamaram todo mundo?" e "insistiram por outras vias?" — visão geral</CardDescription>
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
                <th className="py-2 pl-2 font-medium text-right">Atrasadas</th>
              </tr>
            </thead>
            <tbody>
              {por_campanha.map((c) => (
                <tr key={c.campanha_id} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => setCampanhaId(c.campanha_id)}>
                  <td className="py-2 pr-3">{c.campanha}</td>
                  <td className="py-2 px-2 text-right">{c.leads}</td>
                  <td className="py-2 px-2 text-right">{c.leads_trabalhados}</td>
                  <td className="py-2 px-2 text-right"><Badge variant={c.cobertura_pct >= 70 ? "default" : c.cobertura_pct >= 30 ? "secondary" : "outline"}>{c.cobertura_pct}%</Badge></td>
                  <td className="py-2 px-2 text-right">{c.leads_multicanal}</td>
                  <td className="py-2 pl-2 text-right">{c.atrasadas > 0 ? <span className="text-red-600 font-medium">{c.atrasadas}</span> : "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">Clique numa campanha pra ver o funil de cobertura por região acima.</p>
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
    </div>
  );
}

function FunilCampanha({ funil }: { funil: Funil }) {
  const f = funil.funil;
  const base = Math.max(f.na_campanha, 1);
  const etapas = [
    { label: "Na campanha", n: f.na_campanha, color: C.slate },
    { label: "Chamados", n: f.chamados, color: C.blue },
    { label: "Em conversa", n: f.em_conversa, color: C.cyan },
    { label: "Quente", n: f.quente, color: C.amber },
    { label: "Convertido", n: f.convertido, color: C.green },
  ];

  // Cobertura da região alvo = UFs que têm leads na campanha
  const alvo = funil.por_uf.filter((u) => u.na_campanha > 0);
  const dispAlvo = alvo.reduce((s, u) => s + (u.disponiveis || 0), 0);
  const chamAlvo = alvo.reduce((s, u) => s + u.chamados, 0);
  const cobAlvo = dispAlvo > 0 ? Math.round((100 * chamAlvo) / dispAlvo) : null;

  const ufData = funil.por_uf
    .filter((u) => u.uf && ((u.disponiveis || 0) > 0 || u.na_campanha > 0))
    .map((u) => ({ uf: u.uf as string, disponiveis: u.disponiveis || 0, chamados: u.chamados, na_campanha: u.na_campanha }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKPI label="Disponíveis na base (alvo)" value={funil.universo_total.toLocaleString()} color={C.slate} />
        <MiniKPI label="Na campanha" value={f.na_campanha.toLocaleString()} color={C.blue} />
        <MiniKPI label="Já chamados" value={f.chamados.toLocaleString()} color={C.cyan} />
        <MiniKPI label="Cobertura da região alvo" value={cobAlvo != null ? `${cobAlvo}%` : "—"} color={C.green} sub={cobAlvo != null ? `${chamAlvo} de ${dispAlvo} disponíveis` : "alvo sem especialidade"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funil */}
        <div>
          <div className="text-sm font-medium mb-2">Funil da campanha</div>
          <div className="space-y-1.5">
            {etapas.map((e) => (
              <div key={e.label} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{e.label}</span>
                <div className="flex-1 bg-muted rounded h-5 overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${Math.max((100 * e.n) / base, e.n > 0 ? 3 : 0)}%`, background: e.color }} />
                </div>
                <span className="w-12 text-right font-semibold">{e.n}</span>
              </div>
            ))}
          </div>
          {(f.descartado > 0 || f.sem_resposta > 0) && (
            <p className="text-xs text-muted-foreground mt-2">Fora do funil: {f.descartado} descartados · {f.sem_resposta} sem resposta</p>
          )}
        </div>

        {/* Cobertura por UF */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Cobertura por região (UF)</div>
          {!funil.tem_alvo_especialidade ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Esta campanha não tem especialidade definida — sem base de comparação por região. (Campanhas novas pelo wizard já trazem o alvo.)</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ufData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="uf" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="disponiveis" name="Disponíveis na base" fill={C.slate} radius={[3, 3, 0, 0]} />
                <Bar dataKey="chamados" name="Já chamados" fill={C.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {funil.tem_alvo_especialidade && (
            <p className="text-xs text-muted-foreground mt-1">Cinza = total de médicos da especialidade na base por estado; verde = quantos já foram chamados. Onde o cinza é alto e o verde baixo, há região pra atacar.</p>
          )}
        </div>
      </div>
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

function MiniKPI({ label, value, color, sub }: any) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

function Canalzinho({ icon: Icon, n }: { icon: any; n: number }) {
  return <span className="inline-flex items-center gap-1" title={`${n}`}><Icon className="h-3.5 w-3.5" /> {n}</span>;
}
