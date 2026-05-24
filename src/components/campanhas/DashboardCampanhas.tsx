import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Rocket,
  Users,
  Flame,
  CheckCircle2,
  Send,
  TrendingUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardRow {
  campanha_id: string;
  nome: string;
  status: string;
  tipo_campanha: string;
  regiao_estado: string | null;
  dias_no_ar: number | null;
  pool_total: number | null;
  pool_pendentes: number | null;
  contatado: number | null;
  em_conversa: number | null;
  quentes: number | null;
  convertidos: number | null;
  total_disparos: number | null;
  total_falhas: number | null;
  taxa_contato_pct: number | null;
  disparos_hoje: number | null;
  disparos_24h: number | null;
  disparos_7d: number | null;
  quente_mais_antigo_h: number | null;
}

export function DashboardCampanhas() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["dashboard-campanhas"],
    queryFn: async (): Promise<DashboardRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_campanhas_dashboard")
        .select("*")
        .in("status", ["ativa", "pausada"])
        .order("disparos_24h", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DashboardRow[];
    },
    refetchInterval: 60_000,
  });

  // Métrica acionável: quantos leads únicos foram descartados por phone inválido.
  // Mostra qualidade da base de leads (NÃO é "erro do sistema" — é dado da fonte).
  const { data: descartadosPhone = 0 } = useQuery({
    queryKey: ["dashboard-descartados-phone"],
    queryFn: async (): Promise<number> => {
      const { count } = await (supabase as any)
        .from("campanha_leads")
        .select("lead_id", { count: "exact", head: false })
        .eq("status", "descartado")
        .or(
          "erro_envio.ilike.%phone%inexistente%,erro_envio.ilike.%Telefone inv%,erro_envio.ilike.%Sem telefone%,erro_envio.ilike.%exists%false%"
        );
      return count ?? 0;
    },
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted/40 rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  // Agregados pra cards de topo
  // Removido 'falhas' cumulativo — métrica enganosa pra equipe não-técnica
  // (inclui pausas anti-ban como se fossem erro). Substituído por
  // "Médicos sem WhatsApp" (descartadosPhone) que é dado de qualidade da base.
  const agg = (rows ?? []).reduce(
    (acc, r) => ({
      campanhas: acc.campanhas + 1,
      pool_total: acc.pool_total + (r.pool_total ?? 0),
      contatado: acc.contatado + (r.contatado ?? 0),
      em_conversa: acc.em_conversa + (r.em_conversa ?? 0),
      quentes: acc.quentes + (r.quentes ?? 0),
      convertidos: acc.convertidos + (r.convertidos ?? 0),
      disparos_24h: acc.disparos_24h + (r.disparos_24h ?? 0),
      disparos_7d: acc.disparos_7d + (r.disparos_7d ?? 0),
    }),
    {
      campanhas: 0,
      pool_total: 0,
      contatado: 0,
      em_conversa: 0,
      quentes: 0,
      convertidos: 0,
      disparos_24h: 0,
      disparos_7d: 0,
    }
  );

  const coberturaPct = agg.pool_total > 0 ? (agg.contatado / agg.pool_total) * 100 : 0;
  const conversionPct = agg.contatado > 0 ? (agg.convertidos / agg.contatado) * 100 : 0;
  const responseRatePct = agg.contatado > 0 ? (agg.em_conversa / agg.contatado) * 100 : 0;

  // Alertas: leads quentes muito antigos
  const quentesAtrasados = (rows ?? []).filter((r) => (r.quente_mais_antigo_h ?? 0) > 24);

  return (
    <div className="space-y-6">
      {/* Cards principais (4 KPIs executivos) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Send}
          label="Cobertura da base"
          value={`${coberturaPct.toFixed(1)}%`}
          sub={`${agg.contatado.toLocaleString("pt-BR")} de ${agg.pool_total.toLocaleString("pt-BR")} leads contatados`}
          tone="info"
        />
        <KpiCard
          icon={TrendingUp}
          label="Taxa de resposta"
          value={`${responseRatePct.toFixed(1)}%`}
          sub={`${agg.em_conversa.toLocaleString("pt-BR")} em conversa`}
          tone="info"
        />
        <KpiCard
          icon={Flame}
          label="Leads quentes em aberto"
          value={agg.quentes.toLocaleString("pt-BR")}
          sub={
            quentesAtrasados.length > 0
              ? `${quentesAtrasados.length} campanha(s) com quentes >24h`
              : "Todos dentro do prazo"
          }
          tone={quentesAtrasados.length > 0 ? "warning" : "info"}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Convertidos"
          value={agg.convertidos.toLocaleString("pt-BR")}
          sub={`${conversionPct.toFixed(2)}% de quem foi contatado`}
          tone="success"
        />
      </div>

      {/* Cards secundários (operação) — métricas acionáveis pra equipe não-técnica */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SmallStat icon={Rocket} label="Campanhas ativas" value={agg.campanhas} />
        <SmallStat icon={Send} label="Disparos 24h" value={agg.disparos_24h.toLocaleString("pt-BR")} />
        <SmallStat icon={Send} label="Disparos 7 dias" value={agg.disparos_7d.toLocaleString("pt-BR")} />
        <SmallStat
          icon={AlertCircle}
          label="Médicos sem WhatsApp"
          value={descartadosPhone.toLocaleString("pt-BR")}
          tooltip="Leads descartados automaticamente porque o telefone não tem WhatsApp ativo. Vale revisar a fonte desses contatos."
        />
      </div>

      {/* Nota contextual: dá tranquilidade sobre o sistema anti-ban funcionar como freio, não como erro */}
      <p className="text-xs text-muted-foreground italic px-1 -mt-2">
        Quando um chip está em pausa anti-ban (esperando o ritmo natural pra não ser bloqueado pelo WhatsApp), as tentativas
        ficam em fila até ele voltar. Isso é proteção, não erro — não aparece nas métricas acima.
      </p>

      {/* Alerta destacado */}
      {quentesAtrasados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              {quentesAtrasados.length} campanha(s) com leads quentes esperando há mais de 24h
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {quentesAtrasados
                .map((r) => `${r.nome} (${r.quente_mais_antigo_h?.toFixed(0)}h)`)
                .slice(0, 3)
                .join(" · ")}
              {quentesAtrasados.length > 3 && ` · +${quentesAtrasados.length - 3} outras`}
            </p>
          </div>
        </div>
      )}

      {/* Tabela compacta por campanha */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h3 className="text-sm font-semibold">Performance por campanha</h3>
          <p className="text-xs text-muted-foreground">Ordenado por disparos das últimas 24h</p>
        </div>
        <ScrollArea className="max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 sticky top-0">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left px-4 py-2 font-medium">Campanha</th>
                <th className="text-right px-3 py-2 font-medium">Base</th>
                <th className="text-right px-3 py-2 font-medium">Contatado</th>
                <th className="text-right px-3 py-2 font-medium">% Cobertura</th>
                <th className="text-right px-3 py-2 font-medium">Em conv.</th>
                <th className="text-right px-3 py-2 font-medium">Quentes</th>
                <th className="text-right px-3 py-2 font-medium">Convert.</th>
                <th className="text-right px-3 py-2 font-medium">24h</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhuma campanha ativa ou pausada.
                  </td>
                </tr>
              ) : (
                (rows ?? []).map((r) => {
                  const pct = r.pool_total ? ((r.contatado ?? 0) / r.pool_total) * 100 : 0;
                  return (
                    <tr key={r.campanha_id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 truncate max-w-[260px]">
                        <div className="font-medium text-foreground/90">{r.nome}</div>
                        {r.regiao_estado && (
                          <div className="text-[10px] text-muted-foreground">{r.regiao_estado}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pool_total ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.contatado ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(0)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.em_conversa ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={cn("font-semibold", (r.quente_mais_antigo_h ?? 0) > 24 && "text-amber-700")}>
                          {r.quentes ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-semibold">
                        {r.convertidos ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.disparos_24h ?? 0}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={r.status === "ativa" ? "default" : "secondary"} className="text-[10px]">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "info" | "warning" | "success" | "default";
}

function KpiCard({ icon: Icon, label, value, sub, tone = "default" }: KpiCardProps) {
  const toneClass = {
    info: "border-blue-200 bg-blue-50/40",
    warning: "border-amber-200 bg-amber-50/40",
    success: "border-emerald-200 bg-emerald-50/40",
    default: "border-border bg-card",
  }[tone];
  const iconClass = {
    info: "text-blue-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
    default: "text-foreground",
  }[tone];

  return (
    <Card className={cn("p-4", toneClass)}>
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
        <Icon className={cn("h-5 w-5", iconClass)} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

interface SmallStatProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Texto explicativo no hover — pra contexto a quem não conhece a métrica. */
  tooltip?: string;
}

function SmallStat({ icon: Icon, label, value, tooltip }: SmallStatProps) {
  return (
    <div
      className="bg-muted/20 border border-border rounded-md px-3 py-2 flex items-center gap-2.5"
      title={tooltip}
    >
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
          {label}
          {tooltip && <span className="text-[10px] opacity-50">ⓘ</span>}
        </div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
