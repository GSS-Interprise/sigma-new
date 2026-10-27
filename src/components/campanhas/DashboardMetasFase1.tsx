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
const META_EVOLUTION_DIA = 700;
const META_OFICIAL_DIA = 250;
const CAP_POR_CHIP = 35;

type Periodo = "hoje" | "semana" | "mes" | "custom";
type DisparoDiaRow = { dia: string; n_disparos: number | null };
type DisparoHojeRow = { n_disparos: number | null };
type CampanhaChipRow = { chip_ids: string[] | null };
type ChipConnectionRow = { id: string; connection_state: string | null };

/**
 * Dashboard Fase 1 — Metas & Período (gestão).
 * Bloco auto-contido no topo do dashboard: filtro de período (atalhos),
 * metas separadas por canal (Evolution + API oficial) e gráfico disparos/dia
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
      const { data, error } = await supabase
        .from("vw_disparos_diarios" as never)
        .select("dia, n_disparos")
        .gte("dia", ini)
        .lte("dia", fim) as unknown as { data: DisparoDiaRow[] | null; error: Error | null };
      if (error) throw error;
      const map = new Map<string, number>();
      (data ?? []).forEach((r) => map.set(r.dia, (map.get(r.dia) || 0) + Number(r.n_disparos || 0)));
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
      const { data, error } = await supabase
        .from("vw_disparos_diarios" as never)
        .select("n_disparos")
        .eq("dia", hojeStr) as unknown as { data: DisparoHojeRow[] | null; error: Error | null };
      if (error) throw error;
      return (data ?? []).reduce((total, row) => total + Number(row.n_disparos || 0), 0);
    },
  });

  // Capacidade: chips únicos em campanhas ativas + quantos estão online
  const { data: chipCap } = useQuery({
    queryKey: ["dash-chip-capacidade"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: camps, error: campsError }, { data: chips, error: chipsError }] = await Promise.all([
        supabase.from("campanhas").select("chip_ids").eq("status", "ativa"),
        supabase.from("chips").select("id, connection_state"),
      ]);
      if (campsError) throw campsError;
      if (chipsError) throw chipsError;
      const emCampanha = new Set<string>();
      ((camps ?? []) as CampanhaChipRow[]).forEach((c) => (c.chip_ids ?? []).forEach((id) => emCampanha.add(id)));
      const stateMap = new Map<string, string | null>(((chips ?? []) as ChipConnectionRow[]).map((c) => [c.id, c.connection_state]));
      let online = 0;
      emCampanha.forEach((id) => { if (stateMap.get(id) === "open") online++; });
      return { total: emCampanha.size, online };
    },
  });

  type CanalStateRow = {
    whatsapp_provider: "evolution" | "twilio" | "chakra" | null;
    disparos_hoje: number | null;
    limite_diario: number | null;
    configured_status: string | null;
  };
  const { data: canalCap } = useQuery({
    queryKey: ["dash-canal-capacidade"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_campanha_operational_state_v2" as never)
        .select("whatsapp_provider, disparos_hoje, limite_diario, configured_status") as unknown as {
          data: CanalStateRow[] | null;
          error: Error | null;
        };
      if (error) throw error;
      const rows = data ?? [];
      const official = rows.filter((row) => row.whatsapp_provider !== "evolution" && !!row.whatsapp_provider);
      const evolution = rows.filter((row) => row.whatsapp_provider === "evolution" || !row.whatsapp_provider);
      return {
        officialToday: official.reduce((sum, row) => sum + Number(row.disparos_hoje || 0), 0),
        // o teto do dia é só o das campanhas ativas; pausada não dispara
        officialLimit: official.filter((row) => row.configured_status === "ativa")
          .reduce((sum, row) => sum + Number(row.limite_diario || META_OFICIAL_DIA), 0),
        evolutionToday: evolution.reduce((sum, row) => sum + Number(row.disparos_hoje || 0), 0),
      };
    },
  });

  const totalPeriodo = serie.reduce((a, b) => a + b.disparos, 0);
  const oficialLimite = canalCap?.officialLimit ?? META_OFICIAL_DIA;
  const metaTotalDia = META_EVOLUTION_DIA + oficialLimite;
  const pctMetaHoje = Math.min(100, Math.round((disparosHoje / metaTotalDia) * 100));
  const chipsOnline = chipCap?.online ?? 0;
  const capacidadeEvolution = chipsOnline * CAP_POR_CHIP;
  const faltamChips = Math.max(0, Math.ceil((META_EVOLUTION_DIA - capacidadeEvolution) / CAP_POR_CHIP));
  const corMeta = (v: number) => (v >= metaTotalDia ? "#10b981" : v >= metaTotalDia / 2 ? "#f59e0b" : "#ef4444");
  const META_DISPAROS_DIA = metaTotalDia;
  // topo do eixo Y robusto (reduce evita NaN/spread anômalo); meta sempre visível
  const maxDisp = serie.reduce((m, s) => Math.max(m, Number(s.disparos) || 0), 0);
  const yTop = Math.max(metaTotalDia, maxDisp);

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Disparos hoje vs 700 */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Send className="h-4 w-4" /> Mensagens hoje (meta {metaTotalDia})
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{disparosHoje}</span>
            <span className="text-sm text-muted-foreground">/ {metaTotalDia}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pctMetaHoje}%`, background: corMeta(disparosHoje) }} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">{pctMetaHoje}% da meta</div>
        </div>

        {/* API oficial: capacidade própria, sem depender de chip Evolution */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Smartphone className="h-4 w-4" /> API oficial hoje
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{canalCap?.officialToday ?? 0}</span>
            <span className="text-sm text-muted-foreground">/ {oficialLimite}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Templates aprovados · sem dependência de chip
          </div>
        </div>

        {/* Evolution: capacidade baseada nos chips online */}
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Gauge className="h-4 w-4" /> Evolution hoje ({chipsOnline} online)
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{canalCap?.evolutionToday ?? 0}</span>
            <span className="text-sm text-muted-foreground">/ {META_EVOLUTION_DIA}</span>
          </div>
          <div className={cn("text-xs mt-2", faltamChips > 0 ? "text-amber-600" : "text-emerald-600")}>
            {faltamChips > 0 ? `Capacidade física: ${capacidadeEvolution}/dia · faltam ${faltamChips} chips` : `Capacidade de chips suficiente ✓`}
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
              <YAxis domain={[0, yTop]} ticks={[0, Math.round(yTop / 2), yTop]} tick={{ fontSize: 11 }} allowDecimals={false} width={44} />
              <Tooltip
                formatter={(v: number | string | undefined) => [`${v ?? 0} disparos`, ""]}
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
