import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquareText, DollarSign, MapPin, AlertTriangle, Sparkles, Stethoscope } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";

const C = { blue: "#2563eb", green: "#16a34a", amber: "#d97706", pink: "#db2777", purple: "#7c3aed", cyan: "#0891b2", orange: "#ea580c", slate: "#64748b" };
const PIE = [C.blue, C.green, C.amber, C.pink, C.purple, C.cyan, C.orange];
const GRID = "#e2e8f0", AXIS = "#64748b";
const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

const LABEL_FORMA: Record<string, string> = {
  por_plantao: "Por plantão", por_producao: "Por produção", por_hora: "Por hora",
  fixo_mensal: "Fixo mensal", misto: "Misto", por_laudo: "Por laudo",
};
const LABEL_MODAL: Record<string, string> = {
  plantao_12h: "Plantão 12h", plantao_24h: "Plantão 24h", plantao: "Plantão", producao: "Produção",
  rotina: "Rotina", sobreaviso: "Sobreaviso", telelaudo: "Telelaudo", eletivo: "Eletivo",
};
const LABEL_OBJ: Record<string, string> = {
  valor_baixo: "Valor baixo", distancia: "Distância", ja_tem_vinculo: "Já tem vínculo",
  carga_horaria_alta: "Carga horária", prefere_outra_regiao: "Prefere outra região",
  burocracia_documentos: "Burocracia", sem_interesse_no_momento: "Sem interesse agora",
  desconfianca: "Desconfiança", outro: "Outro",
};
const human = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Perfil = {
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
    for (const x of arr) {
      if (!x) continue;
      c.set(x, (c.get(x) || 0) + 1);
    }
  }
  return [...c.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

export function AbaInsightsConversas() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["insights-conversas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("banco_interesse_leads")
        .select("forma_pagamento_preferida, modalidade_preferida, valor_minimo_aceitavel, ufs, especialidades_interesse, objecoes, temas, confianca_score");
      if (error) throw error;
      return (data ?? []) as Perfil[];
    },
  });

  const m = useMemo(() => {
    const total = rows.length;
    const comForma = rows.filter((r) => r.forma_pagamento_preferida);
    const forma = contar(comForma, (p) => p.forma_pagamento_preferida).map((x) => ({ ...x, label: LABEL_FORMA[x.k] || human(x.k) }));
    const modalidade = contar(rows, (p) => p.modalidade_preferida).map((x) => ({ ...x, label: LABEL_MODAL[x.k] || human(x.k) }));
    const objecoes = contar(rows, (p) => p.objecoes).map((x) => ({ ...x, label: LABEL_OBJ[x.k] || human(x.k) })).slice(0, 8);
    const temas = contar(rows, (p) => p.temas).slice(0, 14);
    const ufs = contar(rows, (p) => p.ufs).slice(0, 8);
    const especialidades = contar(rows, (p) => p.especialidades_interesse).slice(0, 8);
    const valores = rows.map((r) => r.valor_minimo_aceitavel).filter((v): v is number => !!v && v > 0);
    const valorMedio = valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : 0;
    const confs = rows.map((r) => r.confianca_score).filter((v): v is number => v != null);
    const confMedia = confs.length ? Math.round(confs.reduce((s, v) => s + v, 0) / confs.length) : 0;
    return { total, forma, modalidade, objecoes, temas, ufs, especialidades, valorMedio, confMedia, comFormaN: comForma.length };
  }, [rows]);

  if (isLoading) return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (m.total === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <MessageSquareText className="h-10 w-10 mx-auto mb-3 opacity-40" />
        Ainda não há perfis extraídos das conversas. Conforme os médicos respondem (≥4 mensagens), a IA extrai os insights automaticamente.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={MessageSquareText} label="Médicos com perfil extraído" value={m.total} color={C.blue} />
        <KPI icon={Sparkles} label="Confiança média da IA" value={`${m.confMedia}%`} color={C.purple} />
        <KPI icon={DollarSign} label="Valor mínimo médio desejado" value={m.valorMedio ? `R$ ${m.valorMedio.toLocaleString()}` : "—"} color={C.green} />
        <KPI icon={MessageSquareText} label="Declararam forma de pagamento" value={m.comFormaN} color={C.amber} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Forma de pagamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /> Forma de pagamento preferida</CardTitle>
            <CardDescription>O que o médico falou na conversa (produção × plantão × hora…)</CardDescription>
          </CardHeader>
          <CardContent>
            {m.forma.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={m.forma} dataKey="n" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={3} stroke="#fff" strokeWidth={2}>
                    {m.forma.map((_x, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Modalidade */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4 text-muted-foreground" /> Modalidade preferida</CardTitle>
            <CardDescription>Tipo de vaga que o médico busca</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Objeções */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" /> Objeções recorrentes</CardTitle>
            <CardDescription>Por que os médicos hesitam — onde agir</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Regiões desejadas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> Regiões desejadas (UF)</CardTitle>
            <CardDescription>Onde os médicos querem trabalhar</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      {/* Temas emergentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" /> Temas que aparecem nas conversas</CardTitle>
          <CardDescription>Assuntos recorrentes captados pela IA (a "infinidade de coisas")</CardDescription>
        </CardHeader>
        <CardContent>
          {m.temas.length === 0 ? <Vazio /> : (
            <div className="flex flex-wrap gap-2">
              {m.temas.map((t) => (
                <Badge key={t.k} variant="secondary" className="text-sm" style={{ fontSize: `${Math.min(16, 11 + t.n)}px` }}>
                  {human(t.k)} <span className="ml-1 opacity-60">{t.n}</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
