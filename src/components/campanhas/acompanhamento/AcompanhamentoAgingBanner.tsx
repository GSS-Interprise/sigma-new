import { useMemo } from "react";
import { Flame, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";

interface Props {
  /** Lista de leads (todos os filtros). Banner conta apenas etapa='quente'. */
  leads: AcompanhamentoLead[];
  /** Threshold de "atraso" em horas. Default 12h conforme sprint plan F3.4. */
  thresholdHoras?: number;
  /** Click no lead atrasado pra abrir o painel. */
  onLeadClick: (lead: AcompanhamentoLead) => void;
}

/**
 * F3.4 — Banner de aging de leads quentes.
 *
 * Quando há lead quente sem dono esperando há mais do threshold,
 * mostra alerta destacado com idade e lista os mais antigos.
 *
 * Escala de cor: <12h calmo (verde), 12-24h atento (amarelo),
 * >24h crítico (vermelho).
 */
export function AcompanhamentoAgingBanner({ leads, thresholdHoras = 12, onLeadClick }: Props) {
  const quentesEsperando = useMemo(() => {
    const agora = Date.now();
    return leads
      .filter((l) => l.etapa_acompanhamento === "quente" && !l.assumido_por && l.data_status)
      .map((l) => {
        const horas = (agora - new Date(l.data_status!).getTime()) / (1000 * 60 * 60);
        return { lead: l, horas };
      })
      .filter((x) => x.horas >= thresholdHoras)
      .sort((a, b) => b.horas - a.horas);
  }, [leads, thresholdHoras]);

  if (quentesEsperando.length === 0) return null;

  // Pior caso define cor do banner
  const piorHoras = quentesEsperando[0].horas;
  const nivel: "atento" | "critico" =
    piorHoras >= 24 ? "critico" : "atento";

  const config = {
    atento: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-900",
      sub: "text-amber-800",
      icon: Clock,
      iconClass: "text-amber-700",
      label: "Atenção",
    },
    critico: {
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-900",
      sub: "text-red-800",
      icon: AlertTriangle,
      iconClass: "text-red-700",
      label: "Crítico",
    },
  }[nivel];

  const Icon = config.icon;
  const mostraN = Math.min(quentesEsperando.length, 5);

  return (
    <Card className={cn("p-3 border", config.bg, config.border)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-semibold", config.text)}>
            {config.label} — {quentesEsperando.length} lead(s) quente(s) esperando há mais de {thresholdHoras}h sem dono
          </div>
          <p className={cn("text-xs mt-1", config.sub)}>
            Lead mais antigo: {Math.floor(piorHoras)}h. Atribua um responsável o quanto antes pra não esfriar.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {quentesEsperando.slice(0, mostraN).map(({ lead, horas }) => {
              const corBadge =
                horas >= 48
                  ? "bg-red-200 text-red-900 border-red-300"
                  : horas >= 24
                    ? "bg-red-100 text-red-900 border-red-200"
                    : "bg-amber-100 text-amber-900 border-amber-200";
              return (
                <button
                  key={lead.campanha_lead_id}
                  type="button"
                  onClick={() => onLeadClick(lead)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium hover:opacity-80 transition-opacity",
                    corBadge
                  )}
                  title={`${lead.lead_nome} — esperando ${Math.floor(horas)}h em ${lead.campanha_nome}`}
                >
                  <Flame className="h-3 w-3" />
                  <span className="truncate max-w-[180px]">{lead.lead_nome}</span>
                  <span className="opacity-70 tabular-nums">{Math.floor(horas)}h</span>
                </button>
              );
            })}
            {quentesEsperando.length > mostraN && (
              <span className={cn("text-xs", config.sub)}>
                +{quentesEsperando.length - mostraN} outros
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
