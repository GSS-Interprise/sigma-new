import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  CircleStop,
  Clock3,
  Hand,
  ListX,
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
  | "aguardando"
  | "rodando"
  | "manual"
  | "fora_horario"
  | "sem_leads"
  | "limite_atingido"
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
  ultimo_disparo: string | null;
  operational_state: OperationalState;
  operational_reason: string;
  horario_inteligente_ativo: boolean;
  horario_inicio_brt: number;
  horario_fim_brt: number;
  dias_semana: number[];
  proxima_tentativa: string | null;
}

interface ChipSummary {
  id: string;
  nome: string;
}

const STATE_META: Record<OperationalState, {
  label: string;
  icon: typeof Play;
  className: string;
}> = {
  configurando: { label: "Configurando", icon: Settings2, className: "border-slate-200 bg-slate-50 text-slate-700" },
  aguardando: { label: "Ativa", icon: CheckCircle2, className: "border-blue-200 bg-blue-50 text-blue-700" },
  rodando: { label: "Ativa · enviando agora", icon: Play, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  manual: { label: "Depende da operadora", icon: Hand, className: "border-violet-200 bg-violet-50 text-violet-700" },
  fora_horario: { label: "Fora do horário", icon: Clock3, className: "border-slate-200 bg-slate-50 text-slate-700" },
  sem_leads: { label: "Sem leads", icon: ListX, className: "border-amber-200 bg-amber-50 text-amber-700" },
  limite_atingido: { label: "Limite atingido", icon: CheckCircle2, className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  pausada: { label: "Pausada", icon: CirclePause, className: "border-amber-200 bg-amber-50 text-amber-700" },
  sem_chip: { label: "Sem chip", icon: Smartphone, className: "border-rose-200 bg-rose-50 text-rose-700" },
  restrita: { label: "Restrita", icon: ShieldAlert, className: "border-orange-200 bg-orange-50 text-orange-700" },
  desconectada: { label: "Desconectada", icon: WifiOff, className: "border-red-200 bg-red-50 text-red-700" },
  finalizada: { label: "Finalizada", icon: CircleStop, className: "border-slate-200 bg-slate-100 text-slate-600" },
};

export function StatusOperacionalPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["campaign-operational-state"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: campaigns, error }, { data: chips, error: chipsError }] = await Promise.all([
        supabase.from("vw_campanha_operational_state" as never).select("*"),
        supabase.from("chips").select("id, nome"),
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

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Não foi possível carregar o estado operacional. Atualize a página e tente novamente.
      </div>
    );
  }

  const campaigns = data?.campaigns ?? [];
  const order: OperationalState[] = [
    "desconectada", "restrita", "sem_chip", "rodando", "aguardando",
    "limite_atingido", "sem_leads", "fora_horario", "manual",
    "pausada", "configurando", "finalizada",
  ];
  const visible = campaigns
    .filter((campaign) => campaign.operational_state !== "finalizada")
    .sort((a, b) => order.indexOf(a.operational_state) - order.indexOf(b.operational_state)
      || a.nome.localeCompare(b.nome));

  const count = (state: OperationalState) =>
    campaigns.filter((campaign) => campaign.operational_state === state).length;
  const attention = count("desconectada") + count("restrita") + count("sem_chip");
  const active = campaigns.filter((campaign) => campaign.configured_status === "ativa").length;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        <strong>Ativa</strong> significa que a campanha está habilitada para operar.
        “Enviando agora” é apenas a atividade observada nos últimos 30 minutos.
        Atualização automática a cada minuto.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Campanhas ativas" value={active} className="text-blue-700" />
        <SummaryCard label="Enviando agora" value={count("rodando")} className="text-emerald-700" />
        <SummaryCard label="Fora do horário" value={count("fora_horario")} className="text-slate-700" />
        <SummaryCard label="Manuais" value={count("manual")} className="text-violet-700" />
        <SummaryCard label="Sem leads" value={count("sem_leads")} className="text-amber-700" />
        <SummaryCard label="Com problema" value={attention} className="text-red-700" />
      </div>

      {attention > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{attention} campanha(s) exigem ação.</strong> Consulte o motivo e os chips abaixo.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Campanha</th>
              <th className="px-3 py-3 font-medium">Estado real</th>
              <th className="px-3 py-3 font-medium">O que está acontecendo</th>
              <th className="px-3 py-3 font-medium">Horário</th>
              <th className="px-3 py-3 font-medium">Chips da campanha</th>
              <th className="px-3 py-3 font-medium">Último envio</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((campaign) => {
              const meta = STATE_META[campaign.operational_state] ?? STATE_META.aguardando;
              const StateIcon = meta.icon;
              const nextAttempt = campaign.proxima_tentativa
                && new Date(campaign.proxima_tentativa) > new Date()
                ? new Date(campaign.proxima_tentativa)
                : null;
              return (
                <tr key={campaign.campanha_id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{campaign.nome.trim()}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {campaign.tipo_envio === "manual" ? "Campanha manual" : "Campanha com IA"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap", meta.className)}>
                      <StateIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </Badge>
                  </td>
                  <td className="max-w-[320px] px-3 py-3 text-xs text-muted-foreground">
                    {campaign.operational_reason}
                    {nextAttempt && (
                      <p className="mt-1 font-medium text-foreground">
                        Próxima tentativa: {nextAttempt.toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">
                    {campaign.horario_inteligente_ativo ? (
                      <>
                        <p>{formatDays(campaign.dias_semana)}</p>
                        <p className="text-muted-foreground">
                          {padHour(campaign.horario_inicio_brt)}–{padHour(campaign.horario_fim_brt)}
                        </p>
                      </>
                    ) : <span className="text-muted-foreground">Sem janela</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {campaign.configured_chip_ids.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {campaign.configured_chip_ids.map((chipId) => (
                        <span key={chipId} className="rounded bg-muted px-2 py-1 text-xs">
                          {data?.chips.get(chipId)?.nome || chipId.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                    {campaign.chips_configured > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {campaign.chips_configured} configurado(s) · {campaign.chips_connected} conectado(s) ·{" "}
                        <strong>{campaign.chips_usable} utilizável(is)</strong>
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {campaign.ultimo_disparo
                      ? formatDistanceToNow(new Date(campaign.ultimo_disparo), { addSuffix: true, locale: ptBR })
                      : "Sem envio"}
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

function padHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatDays(days: number[]) {
  const normalized = [...days].sort((a, b) => a - b).join(",");
  if (normalized === "1,2,3,4,5") return "Seg–Sex";
  if (normalized === "1,2,3,4,5,6") return "Seg–Sáb";
  if (normalized === "1,2,3,4,5,6,7") return "Todos os dias";
  const labels = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  return days.map((day) => labels[day]).filter(Boolean).join(", ");
}

function SummaryCard({ label, value, className }: {
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
