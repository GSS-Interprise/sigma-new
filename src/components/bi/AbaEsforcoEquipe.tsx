import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ListChecks, Clock, AlertTriangle, Target, Users, Filter,
  MessageCircle, Phone, Instagram, Mail, MapPin, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  FunnelChart, Funnel, LabelList, RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";

// Paleta tinta (nunca #000/#fff puro), semântica de estado.
const C = {
  green: "#15994f", greenD: "#0f7a3e",
  blue: "#2563eb", blueD: "#1e4fc4",
  amber: "#d97706", amberD: "#b45f06",
  red: "#dc2626", redD: "#b01c1c",
  cyan: "#0e9aaf", purple: "#7c5cdb",
  ink: "#1e293b", soft: "#64748b", grid: "#eef2f7",
};
const tooltipStyle = { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 16px rgba(15,23,42,.08)" };
const CANAL = { whatsapp: { label: "WhatsApp", cor: C.green }, ligacao: { label: "Ligação", cor: C.amber }, instagram: { label: "Instagram", cor: C.purple }, email: { label: "E-mail", cor: C.blue } } as Record<string, { label: string; cor: string }>;

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

const PERIODOS = [{ key: "tudo", label: "Tudo" }, { key: "30d", label: "30 dias" }, { key: "mes", label: "Este mês" }];
function desdeFrom(key: string): string | null {
  const now = new Date();
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
  if (key === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return null;
}
const fmt = (n: number) => n.toLocaleString("pt-BR");

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

  if (isLoading) return <BISkeleton />;
  if (!data) return null;
  const { resumo, por_campanha, por_canal, por_pessoa } = data;
  const naoDescartadas = Math.max(resumo.feitas + resumo.pendentes + resumo.atrasadas, 1);

  return (
    <div className="space-y-5">
      {/* Período — segmentado */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><ListChecks className="h-4 w-4 text-slate-400" /> Esforço da equipe</h2>
        <div className="inline-flex rounded-lg border bg-slate-50 p-0.5">
          {PERIODOS.map((p) => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${periodo === p.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumo — banda única com divisórias + barra de proporção (não 4 cards iguais) */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
            <Stat icon={ListChecks} label="Concluídas" value={fmt(resumo.feitas)} cor={C.green} />
            <Stat icon={Clock} label="Pendentes" value={fmt(resumo.pendentes)} cor={C.amber} />
            <Stat icon={AlertTriangle} label="Atrasadas" value={fmt(resumo.atrasadas)} cor={C.red} />
            <Stat icon={Target} label="Conclusão" value={`${resumo.pct_conclusao}%`} cor={C.blue} sub="tarefas não descartadas" />
          </div>
          {/* barra de proporção do total */}
          <div className="h-2 w-full flex">
            <div style={{ width: `${(resumo.feitas / naoDescartadas) * 100}%`, background: C.green }} />
            <div style={{ width: `${(resumo.pendentes / naoDescartadas) * 100}%`, background: C.amber }} />
            <div style={{ width: `${(resumo.atrasadas / naoDescartadas) * 100}%`, background: C.red }} />
          </div>
        </CardContent>
      </Card>

      {/* Funil de cobertura por campanha */}
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-800 flex items-center gap-2"><Filter className="h-4 w-4 text-blue-600" /> Funil de cobertura por campanha</div>
              <p className="text-xs text-slate-500 mt-0.5">"Já chamamos todos os médicos daquela região?" — comparado com a base total</p>
            </div>
            <Select value={campanhaId} onValueChange={setCampanhaId}>
              <SelectTrigger className="w-[300px]"><SelectValue placeholder="Selecione uma campanha…" /></SelectTrigger>
              <SelectContent>
                {por_campanha.map((c) => <SelectItem key={c.campanha_id} value={c.campanha_id}>{c.campanha}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!campanhaId ? (
            <div className="text-center text-sm text-slate-400 py-10 border border-dashed rounded-xl">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Escolha uma campanha pra ver o funil e a cobertura por região.
            </div>
          ) : loadingFunil || !funil ? (
            <div className="flex items-center justify-center h-56"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
          ) : (
            <FunilCampanha funil={funil} />
          )}
        </CardContent>
      </Card>

      {/* Tarefas por campanha + canal */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            <div className="font-semibold text-slate-800 mb-1">Tarefas por campanha</div>
            <p className="text-xs text-slate-500 mb-3">Concluídas, pendentes e atrasadas — onde a equipe está em dia ou travada</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={por_campanha.map((c) => ({ ...c, nome: c.campanha.length > 20 ? c.campanha.slice(0, 20) + "…" : c.campanha }))} layout="vertical" margin={{ left: 70, right: 12 }} barCategoryGap={10}>
                <defs>
                  <Grad id="gG" c={C.green} /><Grad id="gA" c={C.amber} /><Grad id="gR" c={C.red} />
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" stroke={C.soft} tick={{ fill: C.soft, fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="nome" type="category" stroke={C.soft} tick={{ fill: C.soft, fontSize: 10 }} width={150} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="feitas" name="Feitas" stackId="a" fill="url(#gG)" />
                <Bar dataKey="pendentes" name="Pendentes" stackId="a" fill="url(#gA)" />
                <Bar dataKey="atrasadas" name="Atrasadas" stackId="a" fill="url(#gR)" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="font-semibold text-slate-800 mb-1">Esforço por canal</div>
            <p className="text-xs text-slate-500 mb-3">Insistência multicanal</p>
            <Donut data={por_canal} />
          </CardContent>
        </Card>
      </div>

      {/* Cobertura geral + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
          <CardContent className="p-5">
            <div className="font-semibold text-slate-800 mb-3">Cobertura e insistência por campanha</div>
            <div className="space-y-2.5">
              {por_campanha.map((c) => (
                <button key={c.campanha_id} onClick={() => setCampanhaId(c.campanha_id)}
                  className="w-full text-left group">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700 group-hover:text-blue-700">{c.campanha}</span>
                    <span className="tabular-nums text-slate-500 shrink-0 ml-2">{c.leads_trabalhados}/{c.leads} · {c.cobertura_pct}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(c.cobertura_pct, 100)}%`, background: c.cobertura_pct >= 70 ? C.green : c.cobertura_pct >= 30 ? C.amber : C.red }} />
                  </div>
                  {c.atrasadas > 0 && <div className="text-[11px] text-red-500 mt-0.5">{c.atrasadas} atrasadas{c.leads_multicanal > 0 ? ` · ${c.leads_multicanal} multicanal` : ""}</div>}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /> Quem concluiu</div>
            <p className="text-xs text-slate-500 mb-3">Ranking por tarefas feitas</p>
            {por_pessoa.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nenhuma tarefa concluída ainda.</p>
            ) : (
              <div className="space-y-3">
                {(() => { const max = Math.max(...por_pessoa.map((p) => p.feitas), 1); return por_pessoa.slice(0, 8).map((p) => (
                  <div key={p.pessoa}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="truncate text-slate-700">{p.pessoa}</span>
                      <span className="tabular-nums font-semibold text-slate-800">{p.feitas}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(p.feitas / max) * 100}%`, background: C.blue }} />
                    </div>
                  </div>
                )); })()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FunilCampanha({ funil }: { funil: Funil }) {
  const f = funil.funil;
  const etapas = [
    { name: "Na campanha", value: f.na_campanha, fill: C.soft },
    { name: "Chamados", value: f.chamados, fill: C.blue },
    { name: "Em conversa", value: f.em_conversa, fill: C.cyan },
    { name: "Quente", value: f.quente, fill: C.amber },
    { name: "Convertido", value: f.convertido, fill: C.green },
  ].filter((e) => e.value > 0 || e.name === "Na campanha");

  const alvo = funil.por_uf.filter((u) => u.na_campanha > 0);
  const dispAlvo = alvo.reduce((s, u) => s + (u.disponiveis || 0), 0);
  const chamAlvo = alvo.reduce((s, u) => s + u.chamados, 0);
  const cobAlvo = dispAlvo > 0 ? Math.round((100 * chamAlvo) / dispAlvo) : null;
  const ufData = funil.por_uf.filter((u) => u.uf && ((u.disponiveis || 0) > 0 || u.na_campanha > 0))
    .map((u) => ({ uf: u.uf as string, disponiveis: u.disponiveis || 0, chamados: u.chamados }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Funil real */}
        <div className="rounded-xl border bg-slate-50/60 p-3">
          <div className="text-xs font-medium text-slate-500 mb-1">Funil — do total da campanha ao fechamento</div>
          <ResponsiveContainer width="100%" height={220}>
            <FunnelChart>
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Funnel dataKey="value" data={etapas} isAnimationActive>
                <LabelList position="right" dataKey="name" fill={C.ink} stroke="none" fontSize={11} />
                <LabelList position="left" dataKey="value" fill={C.soft} stroke="none" fontSize={11} formatter={(v: number) => fmt(v)} />
                {etapas.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
          {(f.descartado > 0 || f.sem_resposta > 0) && (
            <div className="text-[11px] text-slate-400 mt-1">Fora do funil: {f.descartado} descartados · {f.sem_resposta} sem resposta</div>
          )}
        </div>

        {/* Gauge de cobertura da região alvo */}
        <div className="rounded-xl border bg-slate-50/60 p-3 flex flex-col">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Cobertura da região alvo</div>
          {cobAlvo == null ? (
            <div className="flex-1 flex items-center justify-center text-center text-xs text-slate-400 px-4">
              Campanha sem especialidade definida — sem base de comparação. (Campanhas novas pelo wizard já trazem o alvo.)
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-3">
              <div className="relative" style={{ width: 150, height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ value: cobAlvo }]} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background={{ fill: "#e9eef5" }} dataKey="value" cornerRadius={20} fill={cobAlvo >= 70 ? C.green : cobAlvo >= 30 ? C.amber : C.red} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-slate-800">{cobAlvo}%</span>
                  <span className="text-[10px] text-slate-400">coberto</span>
                </div>
              </div>
              <div className="text-sm space-y-1.5">
                <MiniRow label="Disponíveis na base" value={fmt(funil.universo_total)} />
                <MiniRow label="Na campanha" value={fmt(f.na_campanha)} cor={C.blue} />
                <MiniRow label="Já chamados" value={fmt(f.chamados)} cor={C.cyan} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cobertura por UF: disponíveis vs chamados */}
      {funil.tem_alvo_especialidade && ufData.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 mb-2">Disponíveis na base × já chamados, por estado</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ufData} margin={{ left: 0, right: 8 }} barGap={2}>
              <defs><Grad id="gSlate" c={C.soft} /><Grad id="gGreen2" c={C.green} /></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="uf" stroke={C.soft} tick={{ fill: C.soft, fontSize: 11 }} />
              <YAxis stroke={C.soft} tick={{ fill: C.soft, fontSize: 11 }} allowDecimals={false} />
              <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(100,116,139,.05)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Bar dataKey="disponiveis" name="Disponíveis na base" fill="url(#gSlate)" radius={[5, 5, 0, 0]} />
              <Bar dataKey="chamados" name="Já chamados" fill="url(#gGreen2)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-400 mt-1">Onde o cinza é alto e o verde baixo, há região com médicos pra atacar.</p>
        </div>
      )}
    </div>
  );
}

function Donut({ data }: { data: Canal[] }) {
  const rows = data.map((c) => ({ ...c, meta: CANAL[c.canal] || { label: c.canal, cor: C.soft } }));
  const total = rows.reduce((s, r) => s + r.total, 0) || 1;
  return (
    <div className="flex items-center gap-2">
      <div className="relative" style={{ width: 150, height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="total" nameKey="meta.label" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {rows.map((r, i) => <Cell key={i} fill={r.meta.cor} />)}
            </Pie>
            <RechartsTooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{fmt(total)}</span>
          <span className="text-[10px] text-slate-400">tarefas</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {rows.map((r) => {
          const Icon = r.canal === "whatsapp" ? MessageCircle : r.canal === "ligacao" ? Phone : r.canal === "instagram" ? Instagram : Mail;
          return (
            <div key={r.canal} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-600"><Icon className="h-3.5 w-3.5" style={{ color: r.meta.cor }} /> {r.meta.label}</span>
              <span className="tabular-nums text-slate-500">{fmt(r.total)} <span className="text-slate-300">·</span> {Math.round((r.total / total) * 100)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Grad({ id, c }: { id: string; c: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={c} stopOpacity={0.95} />
      <stop offset="100%" stopColor={c} stopOpacity={0.65} />
    </linearGradient>
  );
}

function Stat({ icon: Icon, label, value, cor, sub }: any) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} /> {label}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: cor }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function MiniRow({ label, value, cor }: { label: string; value: string; cor?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-lg font-bold" style={{ color: cor || C.ink }}>{value}</span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  );
}

function BISkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-20 rounded-xl bg-slate-100" />
      <div className="h-64 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-5 gap-5"><div className="col-span-3 h-72 rounded-xl bg-slate-100" /><div className="col-span-2 h-72 rounded-xl bg-slate-100" /></div>
    </div>
  );
}
