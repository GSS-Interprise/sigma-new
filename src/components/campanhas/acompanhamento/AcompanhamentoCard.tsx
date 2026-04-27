import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Flame, MessageSquare, MapPin, Stethoscope, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AcompanhamentoLead } from "@/hooks/useAcompanhamentoLeads";
import { CardActionsMenu } from "@/components/demandas/CardActionsMenu";

interface Props {
  lead: AcompanhamentoLead;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function AcompanhamentoCard({ lead, onClick, onDragStart, onDragEnd }: Props) {
  const idade = lead.data_status
    ? formatDistanceToNow(new Date(lead.data_status), { addSuffix: false, locale: ptBR })
    : null;

  const semDono = !lead.assumido_por;
  const iniciaisDono = lead.assumido_por_nome
    ? lead.assumido_por_nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group bg-card border rounded-md p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all ${
        semDono && lead.etapa_acompanhamento === "quente" ? "border-l-4 border-l-red-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium leading-tight truncate">{lead.lead_nome}</h4>
          {lead.lead_especialidade && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
              <Stethoscope className="h-3 w-3 shrink-0" />
              {lead.lead_especialidade}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {semDono && lead.etapa_acompanhamento === "quente" && (
            <Flame className="h-4 w-4 text-red-500" />
          )}
          <CardActionsMenu
            tipo="lead"
            recursoId={lead.lead_id}
            label={`${lead.lead_nome}${lead.lead_especialidade ? " — " + lead.lead_especialidade : ""}`}
          />
        </div>
      </div>

      {(lead.lead_cidade || lead.lead_uf) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
          <MapPin className="h-3 w-3" />
          {[lead.lead_cidade, lead.lead_uf].filter(Boolean).join("/")}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground mb-2 truncate" title={lead.campanha_nome}>
        {lead.campanha_nome}
      </p>

      <div className="flex items-center gap-1 mb-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < lead.validacoes_ok ? "bg-green-500" : "bg-muted"
            }`}
          />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1 tabular-nums">
          {lead.validacoes_ok}/4
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          <span>{lead.msgs_total}</span>
          {idade && (
            <>
              <Clock className="h-3 w-3 ml-1" />
              <span className="truncate">{idade}</span>
            </>
          )}
        </div>
        {semDono ? (
          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-300 text-amber-700 bg-amber-50">
            sem dono
          </Badge>
        ) : (
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px] bg-primary/10">{iniciaisDono}</AvatarFallback>
          </Avatar>
        )}
      </div>

      {lead.etapa_acompanhamento === "perdido" && lead.motivo_perdido && (
        <p className="text-[10px] text-muted-foreground mt-2 italic line-clamp-2 border-t pt-1.5">
          {lead.motivo_perdido}
        </p>
      )}
    </div>
  );
}
