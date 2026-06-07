import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Smartphone, Gauge, Loader2 } from "lucide-react";
import { format, startOfWeek, startOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

// Metas operacionais (reunião Bruna 03/06 + anti-ban WS2): 20 chips × 35/dia = 700/dia.
const META_DISPAROS_DIA = 700;
const META_CHIPS = 20;
const CAP_POR_CHIP = 35;

type Periodo = "hoje" | "semana" | "mes" | "custom";

/**
 * Dashboard Fase 1 — Metas & Período (gestão).
 * Bloco auto-contido no topo do dashboard: filtro de período (atalhos),
 * meta de 700 disparos/dia, capacidade de chips (meta 20) e gráfico disparos/dia
 * vs meta. Fonte: vw_disparos_diarios (série temporal em BRT).
 */
export function DashboardMetasFase1() {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");

  const now = new Date();
  const hojeStr = format(now, "yyyy-MM-dd");
  let ini = hojeStr;
  let fim = hojeStr;
  if (periodo === "semana") ini = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  else if (periodo === "mes") ini = format(startOfMonth(now), "yyyy-MM-dd");
  else if (periodo === "custom" && customIni && customFim) {
    ini = customIni;
    fim = customFim;
  }

  // Série de disparos por dia no período (preenche dias zerados pro gráfico ficar contínuo)
  const { data: serie = [], isLoading } = useQuery({
    queryKey: ["dash-disparos-diarios", ini, fim],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_disparos_diarios")
        .select("dia, n_disparos")
        .gte("dia", ini)
        .lte("dia", fim);
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.dia, (map.get(r.dia) || 0) + Number(r.n_disparos)));
      let dias: Date[] = [];
      try {
        dias = eachDayOfInterval({ start: parseISO(ini), end: parseISO(fim) });
      } catch {
        dias = [parseISO(hojeStr)];
      }
      return dias.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        return { dia: key, label: format(d, "dd/MM"), disparos: map.get(key) || 0 };
      });
    },
  });

  // Disparos de HOJE (card de meta sempre mostra hoje, independente do período do gráfico)
  const { data: disparosHoje = 0 } = useQuery({
    queryKey: ["dash-disparos-hoje", hojeStr],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_disparos_diarios")
        .select("n_disparos")
        .eq("dia", hojeStr);
      return (data ?? []).reduce((a: number, b: any) => a + Number(b.n_disparos), 0);
    },
  });

  // Capacidade: chips únicos em campanhas ativas + quantos estão online
  const { data: chipCap } = useQuery({
    queryKey: ["dash-chip-capacidade"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: camps }, { data: chips }] = await Promise.all([
        (supabase as any).from("campanhas").select("chip_ids").eq("status", "ativa"),
        (supabase as any).from("chips").select("id, connection_state"),
      ]);
      const emCampanha = new Set<string>();
      (camps ?? []).forEach((c: any) => (c.chip_ids ?? []).forEach((id: string) => emCampanha.add(id)));
      const stateMap = new Map<string, string>((chips ?? []).map((c: any) => [c.id, c.connection_state]));
      let online = 0;
      emCampanha.forEach((id) => { if (stateMap.get(id) === "open") online++; });
      return { total: emCampanha.size, online };
    },
  });

  const totalPeriodo = serie.reduce((a, b) => a + b.disparos, 0);
  const pctMetaHoje = Math.min(100, Math.round((disparosHoje / META_DISPAROS_DIA) * 100));
  const chipsOnline = chipCap?.online ?? 0;
  const capacidade = chipsOnline * CAP_POR_CHIP;
  const faltamChips = Math.max(0, Math.ceil((META_DISPAROS_DIA - capacidade) / CAP_POR_CHIP));
  const corMeta = (v: number) => (v >= META_DISPAROS_DIA ? "#10b981" : v >= META_DISPAROS_DIA / 2 ? "#f59e0b" : "#ef4444");
  const yMax = Math.max(META_DISPAROS_DIA, ...serie.map((s) => s.disparos)) * 1.1;

  const ATALHOS: { k: Periodo; label: string }[] = [
    { k: "hoje", label: "Hoje" },
    { k: "semana", label: "Esta semana" },
    { k: "mes", label: "Este mês" },
    { k: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-3">
      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        {ATALHOS.map((a) => (
          <Button
            key={a.k}
            size="sm"
            variant={periodo === a.k ? "default" : "outline"}
            onClick={() => setPeriodo(a.k)}
          >
            {a.label}
          </Button>
        ))}
        {periodo === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={customIni} onChange={(e) => setCustomIni(e.target.value)} className="h-9 w-auto" />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" value={customFim} onChange={(e) => setCustomFim(e.target.value)} className="h-9 w-auto" />
          </div>
        )}
      </div>

      {/* Cards de meta */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Disparos hoje vs 700 */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Send className="h-4 w-4" /> Disparos hoje (meta {META_DISPAROS_DIA})
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{disparosHoje}</span>
            <span className="text-sm text-muted-foreground">/ {META_DISPAROS_DIA}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pctMetaHoje}%`, background: corMeta(disparosHoje) }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{pctMetaHoje}% da meta</div>
        </div>

        {/* Chips rodando vs 20 */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Smartphone className="h-4 w-4" /> Chips em campanha (meta {META_CHIPS})
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{chipsOnline}</span>
            <span className="text-sm text-muted-foreground">/ {META_CHIPS} online</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {chipCap ? `${chipCap.total} atribuídos, ${chipsOnline} conectados` : "—"}
          </div>
        </div>

        {/* Capacidade teórica */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Gauge className="h-4 w-4" /> Capacidade ({chipsOnline} × {CAP_POR_CHIP})
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{capacidade}</span>
            <span className="text-sm text-muted-foreground">/dia possíveis</span>
          </div>
          <div className={cn("text-xs mt-2", faltamChips > 0 ? "text-amber-600" : "text-emerald-600")}>
            {faltamChips > 0 ? `Faltam ${faltamChips} chips online pra bater ${META_DISPAROS_DIA}/dia` : `Capacidade suficiente pra meta ✓`}
          </div>
        </div>
      </div>

      {/* Gráfico disparos/dia vs meta */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Disparos por dia vs meta</h3>
          <span className="text-xs text-muted-foreground">Total no período: <strong>{totalPeriodo.toLocaleString("pt-BR")}</strong></span>
        </div>
        {isLoading ? (
          <div className="h-56 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={serie} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[0, yMax]} tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: any) => [`${v} disparos`, ""]}
                labelFormatter={(l) => `Dia ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <ReferenceLine y={META_DISPAROS_DIA} stroke="#10b981" strokeDasharray="4 4" label={{ value: `meta ${META_DISPAROS_DIA}`, position: "insideTopRight", fontSize: 10, fill: "#10b981" }} />
              <Bar dataKey="disparos" radius={[3, 3, 0, 0]}>
                {serie.map((d, i) => (
                  <Cell key={i} fill={corMeta(d.disparos)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
