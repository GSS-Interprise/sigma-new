import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Hand, Megaphone, Target, Inbox } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ConversaOrigem, OrigemInfo } from "@/hooks/useSigzapConversationOrigem";

interface Props {
  info?: OrigemInfo;
  selected?: boolean;
  size?: "xs" | "sm";
}

const CONFIG: Record<ConversaOrigem, { label: string; cls: string; selectedCls: string; Icon: any }> = {
  manual: {
    label: "Manual",
    cls: "border-purple-600 bg-purple-600 text-white dark:border-purple-500 dark:bg-purple-500",
    selectedCls: "border-white/40 bg-white/20 text-white",
    Icon: Hand,
  },
  massa: {
    label: "Campanha",
    cls: "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500",
    selectedCls: "border-white/40 bg-white/20 text-white",
    Icon: Megaphone,
  },
  trafego_pago: {
    label: "Anúncio",
    cls: "border-orange-500 bg-orange-500 text-white dark:border-orange-400 dark:bg-orange-400",
    selectedCls: "border-white/40 bg-white/20 text-white",
    Icon: Target,
  },
  inbound: {
    label: "Inbound",
    cls: "border-slate-500 bg-slate-500 text-white dark:border-slate-400 dark:bg-slate-400",
    selectedCls: "border-white/40 bg-white/20 text-white",
    Icon: Inbox,
  },
};

export function SigZapOrigemBadge({ info, selected, size = "xs" }: Props) {
  if (!info) return null;
  const cfg = CONFIG[info.origem] || CONFIG.inbound;
  const { Icon } = cfg;
  const tooltipParts: string[] = [];
  if (info.campanha_nome) tooltipParts.push(`Campanha: ${info.campanha_nome}`);
  if (info.ultimo_envio_at) {
    tooltipParts.push(
      `Enviado em ${format(new Date(info.ultimo_envio_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
    );
  }
  if (tooltipParts.length === 0) {
    tooltipParts.push(
      info.origem === "inbound"
        ? "Lead chegou sem disparo nosso prévio"
        : `Origem: ${cfg.label}`
    );
  }
  const badge = (
    <Badge
      className={cn(
        size === "xs" ? "text-[10px] h-5" : "text-xs h-6",
        "gap-1 border",
        selected ? cfg.selectedCls : cfg.cls
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs space-y-0.5">
          {tooltipParts.map((p, i) => <div key={i}>{p}</div>)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
