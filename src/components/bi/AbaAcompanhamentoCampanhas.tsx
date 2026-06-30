import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Radio, Rocket, AlertTriangle, Smartphone, Bot, User,
  RefreshCw, Activity, CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

// Paleta tinta + semântica de estado (alinhada às outras abas do /bi).
const C = {
  green: "#15994f", blue: "#2563eb", amber: "#d97706", red: "#dc2626",
  purple: "#7c5cdb", cyan: "#0e9aaf", ink: "#1e293b", soft: "#64748b", grid: "#eef2f7",
};
const tooltipStyle = { backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 16px rgba(15,23,42,.08)" };
const fmt = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");

type Campanha = {
  campanha_id: string; campanha: string; tipo: string; status: string;
  disparos_hoje: number; disparos_7d: number; disparos_total: number; ultimo_disparo: string | null;
  leads: number; frio: number; contatados: number; em_conversa: number; quente: number; convertido: number;
  chips_total: number; chips_online: number;
};
type Dados = {
  hoje: { ia: number; manual: number; total: number };
  periodo: { ia: number; manual: number; total: number };
  resumo: { ativas: number; pausadas: number; rodando_hoje: number; paradas: number; sem_chip_online: number };
  por_dia: { dia: string; ia: number; manual: number; total: number }[];
  campanhas: Campanha[];
};

const PERIODOS = [{ key: "30", label: "30 dias" }, { key: "90", label: "90 dias" }, { key: "tudo", label: "Tudo" }];
function desdeFrom(key: string): string | null {
  if (key === "tudo") return null;
  const d = new Date();
  d.setDate(d.getDate() - Number(key));
  return d.toISOString().slice(0, 10);
}

// Saúde operacional de uma campanha, derivada do disparo + chip.
type Saude = { key: string; label: string; cor: string };
function saudeDe(c: Campanha): Saude {
  if (c.status === "pausada") return { key: "pausada", label: "Pausada", cor: C.soft };
  if (c.chips_online === 0) return { key: "sem_chip", label: "Sem chip online", cor: C.red };
  if (c.disparos_hoje > 0) return { key: "rodando", label: "Disparando hoje", cor: C.green };
  if (c.disparos_7d > 0) return { key: "lenta", label: "Lenta", cor: C.amber };
  return { key: "parada", label: "Parada", cor: C.red };
}

function haQuanto(ts: string | null): string {
  if (!ts) return "nunca";
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d}d`;
}

export function AbaAcompanhamentoCampanhas() {
  const [periodo, setPeriodo] = useState("30");
  const [tipoFiltro, setTipoFiltro] = useState<"todas" | "ia" | "manual">("todas");
  const [soAtencao, setSoAtencao] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["bi-acompanhamento-campanhas", periodo],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_acompanhamento_campanhas", { p_desde: desdeFrom(periodo) });
      if (error) throw error;
      return data as Dados;
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  const serie = useMemo(
    () => (data?.por_dia ?? []).map((r) => ({ dia: String(r.dia).slice(5), ia: Number(r.ia) || 0, manual: Number(r.manual) || 0 })),
    [data]
  );

  const campanhas = useMemo(() => {
    let cs = (data?.campanhas ?? []).map((c) => ({ ...c, saude: saudeDe(c) }));
    if (tipoFiltro !== "todas") cs = cs.filter((c) => c.tipo === tipoFiltro);
    if (soAtencao) cs = cs.filter((c) => c.saude.key === "parada" || c.saude.key === "sem_chip");
    // ordena: problemas primeiro, depois rodando, depois resto
    const rank = (k: string) => (k === "sem_chip" || k === "parada" ? 0 : k === "lenta" ? 1 : k === "rodando" ? 2 : 3);
    return cs.sort((a, b) => rank(a.saude.key) - rank(b.saude.key) || b.disparos_7d - a.disparos_7d);
  }, [data, tipoFiltro, soAtencao]);

  if (isLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const r = data.resumo;
  const ativasBase = Math.max(r.ativas, 1);
  const lentas = Math.max(r.ativas - r.rodando_hoje - r.paradas, 0);
  const precisamAtencao = (data.campanhas ?? []).filter((c) => c.status === "ativa" && (c.chips_online === 0 || (c.ultimo_disparo === null || new Date(c.ultimo_disparo).getTime() < Date.now() - 2 * 86400000)));

  return (
    <div className="space-y-5">
      {/* Cabeçalho + período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Rocket className="h-4 w-4 text-slate-400" /> Acompanhamento das campanhas
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">As campanhas estão disparando? Quanto sai por dia, IA × manual, e quem travou.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-slate-50 p-0.5">
            {PERIODOS.map((p) => (
              <button key={p.key} onClick={() => setPeriodo(p.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${periodo === p.key ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => refetch()} disabled={isFetching} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Pulso de hoje — banda única com divisórias + barra de proporção */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-y md:divide-y-0 divide-slate-100">
            <Pulso icon={Activity} label="Disparos hoje" value={fmt(data.hoje.total)} cor={data.hoje.total > 0 ? C.green : C.red} sub={`IA ${data.hoje.ia} · Manual ${data.hoje.manual}`} big />
            <Pulso icon={Rocket} label="Campanhas ativas" value={fmt(r.ativas)} cor={C.ink} sub={`${r.pausadas} pausadas`} />
            <Pulso icon={CheckCircle2} label="Disparando hoje" value={fmt(r.rodando_hoje)} cor={C.green} />
            <Pulso icon={AlertTriangle} label="Paradas" value={fmt(r.paradas)} cor={r.paradas > 0 ? C.red : C.soft} />
            <Pulso icon={Smartphone} label="Sem chip online" value={fmt(r.sem_chip_online)} cor={r.sem_chip_online > 0 ? C.red : C.soft} />
          </div>
          {/* proporção entre as ativas: rodando / lentas / paradas */}
          <div className="h-2 w-full flex">
            <div style={{ width: `${(r.rodando_hoje / ativasBase) * 100}%`, background: C.green }} />
            <div style={{ width: `${(lentas / ativasBase) * 100}%`, background: C.amber }} />
            <div style={{ width: `${(r.paradas / ativasBase) * 100}%`, background: C.red }} />
          </div>
        </CardContent>
      </Card>

      {/* Alertas acionáveis */}
      {precisamAtencao.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-800 mb-2">
            <AlertTriangle className="h-4 w-4" /> {precisamAtencao.length} campanha(s) ativa(s) precisam de atenção
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {precisamAtencao.slice(0, 8).map((c) => (
              <div key={c.campanha_id} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-1.5 text-sm">
                <span className="truncate text-slate-700">{c.campanha}</span>
                <span className="shrink-0 ml-2 text-xs font-medium text-red-700">
                  {c.chips_online === 0 ? "sem chip online" : `parada · ${haQuanto(c.ultimo_disparo)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disparos por dia — IA × Manual */}
      <Card>
        <CardContent className="p-5">
          <div className="font-semibold text-slate-800 mb-1">A máquina está rodando?</div>
          <p className="text-xs text-slate-500 mb-3">Disparos das campanhas por dia — IA (automático) × Manual (equipe)</p>
          {serie.length === 0 ? (
            <p className="text-sm py-10 text-center text-slate-400">Nenhuma campanha disparou no período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="dia" stroke={C.soft} tick={{ fill: C.soft, fontSize: 11 }} />
                <YAxis stroke={C.soft} tick={{ fill: C.soft, fontSize: 11 }} allowDecimals={false} />
                <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,.05)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="ia" stackId="d" name="IA (automático)" fill={C.purple} />
                <Bar dataKey="manual" stackId="d" name="Manual (equipe)" fill={C.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela por campanha */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
            <div className="font-semibold text-slate-800 flex items-center gap-2"><Radio className="h-4 w-4 text-slate-400" /> Cada campanha</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border bg-slate-50 p-0.5">
                {(["todas", "ia", "manual"] as const).map((t) => (
                  <button key={t} onClick={() => setTipoFiltro(t)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${tipoFiltro === t ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}>
                    {t === "ia" ? "IA" : t}
                  </button>
                ))}
              </div>
              <button onClick={() => setSoAtencao((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${soAtencao ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                <AlertTriangle className="h-3.5 w-3.5" /> Só com problema
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-y bg-muted/30">
                  <th className="py-2.5 px-4 font-medium">Campanha</th>
                  <th className="py-2.5 px-2 font-medium">Situação</th>
                  <th className="py-2.5 px-2 font-medium text-right">Hoje</th>
                  <th className="py-2.5 px-2 font-medium text-right">7 dias</th>
                  <th className="py-2.5 px-2 font-medium">Último disparo</th>
                  <th className="py-2.5 px-2 font-medium">Funil (contatados / leads)</th>
                  <th className="py-2.5 px-2 font-medium text-center">Chips</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const cob = c.leads > 0 ? Math.round((100 * c.contatados) / c.leads) : 0;
                  return (
                    <tr key={c.campanha_id} className="border-b last:border-0 hover:bg-muted/20 align-middle">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-800">{c.campanha}</div>
                        <Badge variant="outline" className={`mt-0.5 text-[10px] ${c.tipo === "ia" ? "border-purple-300 bg-purple-50 text-purple-700" : "border-blue-300 bg-blue-50 text-blue-700"}`}>
                          {c.tipo === "ia" ? <Bot className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
                          {c.tipo === "ia" ? "IA" : "Manual"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: c.saude.cor }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: c.saude.cor }} /> {c.saude.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-bold" style={{ color: c.disparos_hoje > 0 ? C.green : "#cbd5e1" }}>{fmt(c.disparos_hoje)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-slate-500">{fmt(c.disparos_7d)}</td>
                      <td className="py-2.5 px-2 text-xs">
                        <span className={c.saude.key === "parada" ? "text-red-600 font-medium" : "text-slate-500"}>{haQuanto(c.ultimo_disparo)}</span>
                      </td>
                      <td className="py-2.5 px-2 min-w-[170px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(cob, 100)}%`, background: cob >= 70 ? C.green : cob >= 30 ? C.amber : C.blue }} />
                          </div>
                          <span className="text-xs tabular-nums text-slate-600">{fmt(c.contatados)}/{fmt(c.leads)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {c.em_conversa} em conversa · {c.quente} quente · {c.convertido} conv.
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${c.chips_online === 0 ? "text-red-600 font-medium" : "text-slate-600"}`}>
                          <Smartphone className="h-3.5 w-3.5" /> {c.chips_online}/{c.chips_total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {campanhas.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-slate-400">Nenhuma campanha {soAtencao ? "com problema" : "ativa ou pausada"}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 p-4 pt-3">
            "Disparando hoje" = saiu ≥1 disparo hoje. "Parada" = ativa sem disparo há 2+ dias. "Sem chip online" = os chips da campanha estão desconectados (não tem como disparar). Atualiza sozinho a cada 2 min.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Pulso({ icon: Icon, label, value, cor, sub, big }: { icon: any; label: string; value: string; cor: string; sub?: string; big?: boolean }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} /> {label}
      </div>
      <div className={`font-bold mt-1 tabular-nums ${big ? "text-3xl" : "text-2xl"}`} style={{ color: cor }}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
