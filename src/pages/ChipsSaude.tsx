import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Smartphone, Wifi, WifiOff, Loader2, RefreshCw, AlertTriangle,
  CheckCircle2, QrCode, Activity,
} from "lucide-react";

type Chip = {
  id: string; nome: string; connection_state: string; pode_disparar: boolean | null;
  categoria_uso: string | null; provedor: string | null; fase: string | null;
  estado_desde: string | null; usavel: boolean; ultima_queda: string | null;
  quedas_24h: number; health: number;
};

function haQuanto(ts: string | null): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}min`;
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ESTADO = {
  open: { label: "Conectado", icon: Wifi, cls: "text-emerald-600", dot: "#15994f" },
  connecting: { label: "Conectando", icon: Loader2, cls: "text-amber-600", dot: "#d97706" },
  close: { label: "Caído (QR)", icon: WifiOff, cls: "text-red-600", dot: "#dc2626" },
} as Record<string, { label: string; icon: any; cls: string; dot: string }>;

export default function ChipsSaude() {
  const qc = useQueryClient();
  const { data: chips = [], isLoading, isFetching } = useQuery({
    queryKey: ["chips-saude"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_chip_saude").select("*");
      if (error) throw error;
      return (data ?? []) as Chip[];
    },
  });

  const sorted = [...chips].sort((a, b) => {
    const rank = (c: Chip) => (c.usavel ? 0 : c.connection_state === "connecting" ? 1 : 2);
    return rank(a) - rank(b) || a.nome.localeCompare(b.nome);
  });
  const open = chips.filter((c) => c.connection_state === "open").length;
  const usaveis = chips.filter((c) => c.usavel).length;
  const caidos = chips.filter((c) => c.connection_state === "close").length;

  const sincronizar = async () => {
    try {
      await supabase.functions.invoke("chip-auto-reconnect", {});
      toast.success("Sincronização disparada — atualizando…");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["chips-saude"] }), 4000);
    } catch (e: any) {
      toast.error("Falha ao sincronizar: " + (e?.message || ""));
    }
  };

  return (
    <AppLayout
      headerActions={
        <div className="flex items-center justify-between w-full gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> Saúde dos Chips</h1>
            <p className="text-sm text-muted-foreground">Capacidade de disparo e quais chips precisam de QR</p>
          </div>
          <Button variant="outline" size="sm" onClick={sincronizar} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Sincronizar
          </Button>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Capacidade no topo */}
        <div className="grid grid-cols-3 gap-3">
          <CapCard icon={CheckCircle2} label="Disparando agora" value={usaveis} total={chips.length} cor="#15994f" />
          <CapCard icon={Wifi} label="Conectados" value={open} total={chips.length} cor="#2563eb" />
          <CapCard icon={QrCode} label="Precisam de QR" value={caidos} total={chips.length} cor="#dc2626" />
        </div>

        {caidos > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><b>{caidos} chip(s) caídos</b> precisam ser reconectados (escanear QR em Configurações → Chips). O sistema avisa o grupo/Bruna quando um chip cai.</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b bg-muted/30">
                    <th className="py-2.5 px-4 font-medium">Chip</th>
                    <th className="py-2.5 px-2 font-medium">Estado</th>
                    <th className="py-2.5 px-2 font-medium">Há</th>
                    <th className="py-2.5 px-2 font-medium">Fase</th>
                    <th className="py-2.5 px-2 font-medium text-center">Dispara?</th>
                    <th className="py-2.5 px-2 font-medium text-right">Quedas 24h</th>
                    <th className="py-2.5 px-2 font-medium text-right">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const e = ESTADO[c.connection_state] || { label: c.connection_state, icon: Smartphone, cls: "text-slate-500", dot: "#64748b" };
                    const Icon = e.icon;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-4">
                          <div className="font-medium flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.dot }} />
                            {c.nome}
                          </div>
                          <div className="text-[11px] text-muted-foreground ml-4">{c.categoria_uso || "—"}{c.provedor === "uazapi" ? " · uazapi" : ""}</div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`inline-flex items-center gap-1 ${e.cls}`}>
                            <Icon className={`h-3.5 w-3.5 ${c.connection_state === "connecting" ? "animate-spin" : ""}`} /> {e.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground">{haQuanto(c.estado_desde)}</td>
                        <td className="py-2.5 px-2 text-muted-foreground">{c.fase || "—"}</td>
                        <td className="py-2.5 px-2 text-center">
                          {c.usavel ? <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" /> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{c.quedas_24h > 0 ? <span className="text-amber-600">{c.quedas_24h}</span> : "0"}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <span className={c.health >= 60 ? "text-red-600" : c.health >= 30 ? "text-amber-600" : "text-emerald-600"}>{c.health}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">Atualiza sozinho a cada 1 min. "Dispara?" = conectado + graduado. Health alto = chip com falhas recentes (entra em pausa automática).</p>
      </div>
    </AppLayout>
  );
}

function CapCard({ icon: Icon, label, value, total, cor }: any) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-400">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} /> {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold" style={{ color: cor }}>{value}</span>
        <span className="text-sm text-slate-400">/ {total}</span>
      </div>
    </CardContent></Card>
  );
}
