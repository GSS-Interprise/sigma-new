import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquareText, DollarSign, MapPin, AlertTriangle, Sparkles, Stethoscope, Filter, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";

const C = { blue: "#2563eb", green: "#16a34a", amber: "#d97706", pink: "#db2777", purple: "#7c3aed", cyan: "#0891b2", orange: "#ea580c", slate: "#64748b", red: "#dc2626" };
const PIE = [C.blue, C.green, C.amber, C.pink, C.purple, C.cyan, C.orange];
const GRID = "#e2e8f0", AXIS = "#64748b";
const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

const LABEL_FORMA: Record<string, string> = { por_plantao: "Por plantão", por_producao: "Por produção", por_hora: "Por hora", fixo_mensal: "Fixo mensal", misto: "Misto", por_laudo: "Por laudo" };
const LABEL_MODAL: Record<string, string> = { plantao_12h: "Plantão 12h", plantao_24h: "Plantão 24h", plantao: "Plantão", producao: "Produção", rotina: "Rotina", sobreaviso: "Sobreaviso", telelaudo: "Telelaudo", eletivo: "Eletivo" };
const LABEL_OBJ: Record<string, string> = { valor_baixo: "Valor baixo", distancia: "Distância", ja_tem_vinculo: "Já tem vínculo", carga_horaria_alta: "Carga horária", prefere_outra_regiao: "Prefere outra região", burocracia_documentos: "Burocracia", sem_interesse_no_momento: "Sem interesse agora", desconfianca: "Desconfiança", outro: "Outro" };
const human = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Perfil = {
  lead_id: string | null;
  created_at: string | null;
  forma_pagamento_preferida: string | null;
  modalidade_preferida: string[] | null;
  valor_minimo_aceitavel: number | null;
  ufs: string[] | null;
  especialidades_interesse: string[] | null;
  objecoes: string[] | null;
  temas: string[] | null;
  confianca_score: number | null;
};

function contar(rows: Perfil[], pick: (p: Perfil) => (string | null)[] | (string | null)) {
  const c = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    const arr = Array.isArray(v) ? v : [v];
    for (const x of arr) { if (!x) continue; c.set(x, (c.get(x) || 0) + 1); }
  }
  return [...c.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

const PERIODOS = [
  { key: "todos", label: "Todo o período", dias: 0 },
  { key: "90", label: "Últimos 90 dias", dias: 90 },
  { key: "30", label: "Últimos 30 dias", dias: 30 },
  { key: "7", label: "Últimos 7 dias", dias: 7 },
];

export function AbaInsightsConversas() {
  const [campanhaId, setCampanhaId] = useState<string>("todas");
  const [periodoKey, setPeriodoKey] = useState<string>("todos");

  const dataIni = useMemo(() => {
    const p = PERIODOS.find((x) => x.key === periodoKey);
    if (!p || p.dias === 0) return null;
    const d = new Date(); d.setDate(d.getDate() - p.dias);
    return d.toISOString().slice(0, 10);
  }, [periodoKey]);

  // Campanhas pro filtro
  const { data: campanhas = [] } = useQuery({
    queryKey: ["bi-campanhas-lista"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("campanhas").select("id, nome").order("created_at", { ascending: false });
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  // Funil de engajamento (server-side, por campanha + período)
  const { data: funil } = useQuery({
    queryKey: ["bi-funil-engajamento", campanhaId, dataIni],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bi_funil_engajamento", {
        p_campanha_id: campanhaId === "todas" ? null : campanhaId,
        p_data_ini: dataIni, p_data_fim: null,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  // Perfis extraídos (banco_interesse_leads) — poucos (~54), traz tudo e filtra no client
  const { data: perfisRaw = [], isLoading } = useQuery({
    queryKey: ["insights-conversas-raw"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("banco_interesse_leads")
        .select("lead_id, created_at, forma_pagamento_preferida, modalidade_preferida, valor_minimo_aceitavel, ufs, especialidades_interesse, objecoes, temas, confianca_score");
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  // Quais leads (dos perfilados) estão na campanha selecionada
  const leadIdsPerfil = useMemo(() => perfisRaw.map((p) => p.lead_id).filter(Boolean) as string[], [perfisRaw]);
  const { data: membership = [] } = useQuery({
    queryKey: ["insights-membership", leadIdsPerfil.join(",")],
    queryFn: async () => {
      if (leadIdsPerfil.length === 0) return [];
      const { data } = await (supabase as any)
        .from("campanha_leads").select("lead_id, campanha_id").in("lead_id", leadIdsPerfil);
      return (data ?? []) as { lead_id: string; campanha_id: string }[];
    },
    enabled: leadIdsPerfil.length > 0,
  });

  const perfis = useMemo(() => {
    let rows = perfisRaw;
    if (dataIni) rows = rows.filter((r) => r.created_at && r.created_at.slice(0, 10) >= dataIni);
    if (campanhaId !== "todas") {
      const leadsNaCampanha = new Set(membership.filter((m) => m.campanha_id === campanhaId).map((m) => m.lead_id));
      rows = rows.filter((r) => r.lead_id && leadsNaCampanha.has(r.lead_id));
    }
    return rows;
  }, [perfisRaw, membership, campanhaId, dataIni]);

  const m = useMemo(() => {
    const total = perfis.length;
    const comForma = perfis.filter((r) => r.forma_pagamento_preferida);
    const forma = contar(comForma, (p) => p.forma_pagamento_preferida).map((x) => ({ ...x, label: LABEL_FORMA[x.k] || human(x.k) }));
    const modalidade = contar(perfis, (p) => p.modalidade_preferida).map((x) => ({ ...x, label: LABEL_MODAL[x.k] || human(x.k) }));
    const objecoes = contar(perfis, (p) => p.objecoes).map((x) => ({ ...x, label: LABEL_OBJ[x.k] || human(x.k) })).slice(0, 8);
    const temas = contar(perfis, (p) => p.temas).slice(0, 14);
    const ufs = contar(perfis, (p) => p.ufs).slice(0, 8);
    const valores = perfis.map((r) => r.valor_minimo_aceitavel).filter((v): v is number => !!v && v > 0);
    const valorMedio = valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : 0;
    const confs = perfis.map((r) => r.confianca_score).filter((v): v is number => v != null);
    const confMedia = confs.length ? Math.round(confs.reduce((s, v) => s + v, 0) / confs.length) : 0;
    return { total, forma, modalidade, objecoes, temas, ufs, valorMedio, confMedia, comFormaN: comForma.length };
  }, [perfis]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={campanhaId} onValueChange={setCampanhaId}>
          <SelectTrigger className="w-[240px] h-9"><SelectValue placeholder="Campanha" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as campanhas</SelectItem>
            {campanhas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodoKey} onValueChange={setPeriodoKey}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Funil de engajamento — a história */}
      {funil && <FunilEngajamento f={funil} />}

      {isLoading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : m.total === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <MessageSquareText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Nenhum médico engajou o suficiente (≥4 mensagens) {campanhaId !== "todas" ? "nesta campanha" : ""} {dataIni ? "no período" : ""} pra a IA extrair perfil.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI icon={MessageSquareText} label="Médicos com perfil extraído" value={m.total} color={C.blue} />
            <KPI icon={Sparkles} label="Confiança média da IA" value={`${m.confMedia}%`} color={C.purple} />
            <KPI icon={DollarSign} label="Valor mínimo médio desejado" value={m.valorMedio ? `R$ ${m.valorMedio.toLocaleString()}` : "—"} color={C.green} />
            <KPI icon={MessageSquareText} label="Declararam forma de pagamento" value={m.comFormaN} color={C.amber} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Forma de pagamento preferida" desc="O que o médico falou na conversa" icon={DollarSign}>
              {m.forma.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={m.forma} dataKey="n" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                      {m.forma.map((_x, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Modalidade preferida" desc="Tipo de vaga que o médico busca" icon={Stethoscope}>
              {m.modalidade.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={m.modalidade} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="label" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={90} />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
                    <Bar dataKey="n" name="Médicos" fill={C.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Objeções recorrentes" desc="Por que os médicos hesitam — onde agir" icon={AlertTriangle}>
              {m.objecoes.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={m.objecoes} layout="vertical" margin={{ left: 110 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis type="number" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="label" type="category" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} width={120} />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(234,88,12,0.06)" }} />
                    <Bar dataKey="n" name="Médicos" fill={C.orange} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Regiões desejadas (UF)" desc="Onde os médicos querem trabalhar" icon={MapPin}>
              {m.ufs.length === 0 ? <Vazio /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={m.ufs} margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="k" stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} />
                    <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(22,163,74,0.06)" }} />
                    <Bar dataKey="n" name="Médicos" fill={C.green} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Temas que aparecem nas conversas" desc="Assuntos recorrentes captados pela IA" icon={Sparkles}>
            {m.temas.length === 0 ? <Vazio /> : (
              <div className="flex flex-wrap gap-2">
                {m.temas.map((t) => (
                  <Badge key={t.k} variant="secondary" className="text-sm" style={{ fontSize: `${Math.min(16, 11 + t.n)}px` }}>
                    {human(t.k)} <span className="ml-1 opacity-60">{t.n}</span>
                  </Badge>
                ))}
              </div>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}

// Funil de engajamento — mostra onde a máquina vaza
function FunilEngajamento({ f }: { f: Record<string, number> }) {
  const base = f.na_campanha || 0;
  const pct = (n: number) => (base ? Math.round((n / base) * 1000) / 10 : 0);
  const steps = [
    { label: "Na campanha", n: f.na_campanha, color: C.slate },
    { label: "Contatados", n: f.contatados, color: C.blue, hint: `${pct(f.frio)}% ainda frios (não contatados)` },
    { label: "Responderam / em conversa", n: f.responderam, color: C.cyan },
    { label: "Perfil extraído pela IA", n: f.perfil_ia, color: C.purple },
    { label: "Quentes", n: f.quente, color: C.amber },
    { label: "Convertidos", n: f.convertido, color: C.green },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="h-4 w-4 text-muted-foreground" /> Funil de engajamento</CardTitle>
        <CardDescription>De quem entrou na campanha até quem converteu — onde a máquina está vazando</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s, i) => {
          const p = pct(s.n || 0);
          const prev = i > 0 ? steps[i - 1].n || 0 : s.n || 0;
          const quedaPct = prev ? Math.round((1 - (s.n || 0) / prev) * 100) : 0;
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">{s.label}</span>
                <span className="text-muted-foreground">{(s.n || 0).toLocaleString("pt-BR")} <span className="text-xs">({p}%)</span></span>
              </div>
              <div className="h-6 w-full rounded bg-muted overflow-hidden">
                <div className="h-full rounded flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(p, 1)}%`, background: s.color }} />
              </div>
              {i > 0 && quedaPct > 0 && (
                <p className="text-[11px] text-red-600 mt-0.5">↓ {quedaPct}% caíram vs. etapa anterior{s.hint ? ` · ${s.hint}` : ""}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, desc, icon: Icon, children }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" /> {title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function KPI({ icon: Icon, label, value, color }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="p-2 rounded-lg" style={{ background: `${color}1a`, color }}><Icon className="h-4 w-4" /></span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </CardContent></Card>
  );
}

function Vazio() {
  return <p className="text-sm text-muted-foreground text-center py-10">Sem dados suficientes ainda.</p>;
}
