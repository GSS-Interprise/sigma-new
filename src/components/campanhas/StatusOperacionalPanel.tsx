import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  CircleStop,
  Loader2,
  Play,
  Settings2,
  ShieldAlert,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type OperationalState =
  | "configurando"
  | "pronta"
  | "rodando"
  | "pausada"
  | "sem_chip"
  | "restrita"
  | "desconectada"
  | "finalizada";

interface CampaignState {
  campanha_id: string;
  nome: string;
  configured_status: string;
  tipo_envio: string | null;
  configured_chip_ids: string[];
  chips_configured: number;
  chips_connected: number;
  chips_usable: number;
  chips_restricted: number;
  ultimo_disparo: string | null;
  operational_state: OperationalState;
  operational_reason: string;
}

interface ChipSummary {
  id: string;
  nome: string;
  numero: string | null;
}

const STATE_META: Record<OperationalState, {
  label: string;
  icon: typeof Play;
  className: string;
}> = {
  configurando: { label: "Configurando", icon: Settings2, className: "border-slate-200 bg-slate-50 text-slate-700" },
  pronta: { label: "Pronta", icon: CheckCircle2, className: "border-blue-200 bg-blue-50 text-blue-700" },
  rodando: { label: "Rodando", icon: Play, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  pausada: { label: "Pausada", icon: CirclePause, className: "border-amber-200 bg-amber-50 text-amber-700" },
  sem_chip: { label: "Sem chip", icon: Smartphone, className: "border-rose-200 bg-rose-50 text-rose-700" },
  restrita: { label: "Restrita", icon: ShieldAlert, className: "border-orange-200 bg-orange-50 text-orange-700" },
  desconectada: { label: "Desconectada", icon: WifiOff, className: "border-red-200 bg-red-50 text-red-700" },
  finalizada: { label: "Finalizada", icon: CircleStop, className: "border-slate-200 bg-slate-100 text-slate-600" },
};

export function StatusOperacionalPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-operational-state"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: campaigns, error }, { data: chips, error: chipsError }] = await Promise.all([
        supabase.from("vw_campanha_operational_state" as never).select("*"),
        supabase.from("chips").select("id, nome, numero"),
      ]);
      if (error) throw error;
      if (chipsError) throw chipsError;
      return {
        campaigns: (campaigns ?? []) as CampaignState[],
        chips: new Map((chips ?? []).map((chip) => [chip.id, chip as ChipSummary])),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Carregando estado operacional...
      </div>
    );
  }

  const campaigns = data?.campaigns ?? [];
  const visible = campaigns
    .filter((campaign) => campaign.operational_state !== "finalizada")
    .sort((a, b) => {
      const order: OperationalState[] = [
        "desconectada",
        "restrita",
        "sem_chip",
        "rodando",
        "pronta",
        "pausada",
        "configurando",
        "finalizada",
      ];
      return order.indexOf(a.operational_state) - order.indexOf(b.operational_state)
        || a.nome.localeCompare(b.nome);
    });

  const count = (state: OperationalState) =>
    campaigns.filter((campaign) => campaign.operational_state === state).length;
  const attention = count("desconectada") + count("restrita") + count("sem_chip");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Uma única regra combina configuração, conexão, restrição e atividade recente.
          Atualização automática a cada minuto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Rodando" value={count("rodando")} className="text-emerald-700" />
        <SummaryCard label="Prontas" value={count("pronta")} className="text-blue-700" />
        <SummaryCard label="Pausadas" value={count("pausada")} className="text-amber-700" />
        <SummaryCard label="Sem chip" value={count("sem_chip")} className="text-rose-700" />
        <SummaryCard label="Restritas" value={count("restrita")} className="text-orange-700" />
        <SummaryCard label="Desconectadas" value={count("desconectada")} className="text-red-700" />
      </div>

      {attention > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{attention} campanha(s) exigem ação.</strong> O motivo abaixo diferencia
            ausência de chip, restrição e desconexão.
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-3 py-3 font-medium">Estado real</th>
              <th className="px-3 py-3 font-medium">Motivo</th>
              <th className="px-3 py-3 font-medium">Chips</th>
              <th className="px-3 py-3 font-medium">Último disparo</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((campaign) => {
              const meta = STATE_META[campaign.operational_state];
              const StateIcon = meta.icon;
              return (
                <tr key={campaign.campanha_id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{campaign.nome.trim()}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {campaign.tipo_envio === "manual" ? "Manual" : "IA"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className={cn("gap-1", meta.className)}>
                      <StateIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </Badge>
                  </td>
                  <td className="max-w-[320px] px-3 py-3 text-xs text-muted-foreground">
                    {campaign.operational_reason}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {campaign.configured_chip_ids.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {campaign.configured_chip_ids.map((chipId) => (
                        <span key={chipId} className="rounded bg-muted px-2 py-1 text-xs">
                          {data?.chips.get(chipId)?.nome || chipId.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                    {campaign.chips_configured > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {campaign.chips_usable}/{campaign.chips_configured} utilizáveis
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {campaign.ultimo_disparo
                      ? formatDistanceToNow(new Date(campaign.ultimo_disparo), {
                          addSuffix: true,
                          locale: ptBR,
                        })
                      : "sem disparo"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className={cn("text-3xl font-bold tabular-nums", className)}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
