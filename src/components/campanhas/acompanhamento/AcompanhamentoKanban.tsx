import { useState } from "react";
import { ChevronDown, ChevronRight, Flame, ClipboardCheck, CheckCircle2, Calendar, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AcompanhamentoCard } from "./AcompanhamentoCard";
import {
  useAcompanhamentoLeads,
  useMoverEtapa,
  useAprovarLead,
  type EtapaAcompanhamento,
  type AcompanhamentoLead,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";

interface Props {
  filtro: FiltroAcompanhamento;
  onLeadClick: (lead: AcompanhamentoLead) => void;
}

const COLUNAS: Array<{
  etapa: EtapaAcompanhamento;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = [
  { etapa: "quente", label: "Quente", icon: Flame, color: "text-red-600", bg: "bg-red-50" },
  { etapa: "em_analise", label: "Em análise", icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
  { etapa: "aprovado", label: "Aprovado", icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-50" },
  { etapa: "na_escala", label: "Na escala", icon: Calendar, color: "text-emerald-600", bg: "bg-emerald-50" },
];

export function AcompanhamentoKanban({ filtro, onLeadClick }: Props) {
  const { porEtapa, todosLeads, isLoading } = useAcompanhamentoLeads(filtro);
  const [perdidoExpanded, setPerdidoExpanded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverEtapa, setDragOverEtapa] = useState<EtapaAcompanhamento | null>(null);
  const moverEtapa = useMoverEtapa();
  const aprovarLead = useAprovarLead();

  const handleDragStart = (campanhaLeadId: string) => setDraggingId(campanhaLeadId);
  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverEtapa(null);
  };

  const handleDragOver = (e: React.DragEvent, etapa: EtapaAcompanhamento) => {
    e.preventDefault();
    setDragOverEtapa(etapa);
  };

  const handleDrop = (etapaDestino: EtapaAcompanhamento) => {
    if (!draggingId) return;
    const lead = todosLeads.find((l) => l.campanha_lead_id === draggingId);
    if (!lead || lead.etapa_acompanhamento === etapaDestino) {
      handleDragEnd();
      return;
    }
    if (etapaDestino === "aprovado") {
      aprovarLead.mutate(draggingId);
    } else {
      moverEtapa.mutate({ campanha_lead_id: draggingId, etapa: etapaDestino });
    }
    handleDragEnd();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUNAS.map((c) => (
          <div key={c.etapa} className="border rounded-md p-3 min-h-[400px] bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUNAS.map((col) => (
          <Coluna
            key={col.etapa}
            etapa={col.etapa}
            label={col.label}
            icon={col.icon}
            color={col.color}
            bg={col.bg}
            leads={porEtapa[col.etapa] || []}
            onLeadClick={onLeadClick}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isOver={dragOverEtapa === col.etapa}
          />
        ))}
      </div>

      <div className="mt-4 border rounded-md bg-muted/20">
        <button
          type="button"
          onClick={() => setPerdidoExpanded(!perdidoExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            {perdidoExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <XCircle className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">Perdido</span>
            <Badge variant="outline" className="text-xs">
              {(porEtapa.perdido || []).length}
            </Badge>
          </div>
        </button>
        {perdidoExpanded && (
          <div className="p-2 space-y-2 border-t">
            {(porEtapa.perdido || []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">vazio</p>
            ) : (
              (porEtapa.perdido || []).map((l) => (
                <AcompanhamentoCard
                  key={l.campanha_lead_id}
                  lead={l}
                  onClick={() => onLeadClick(l)}
                  onDragStart={() => handleDragStart(l.campanha_lead_id)}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface ColunaProps {
  etapa: EtapaAcompanhamento;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  leads: AcompanhamentoLead[];
  onLeadClick: (lead: AcompanhamentoLead) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, etapa: EtapaAcompanhamento) => void;
  onDrop: (etapa: EtapaAcompanhamento) => void;
  isOver: boolean;
}

function Coluna({
  etapa,
  label,
  icon: Icon,
  color,
  bg,
  leads,
  onLeadClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isOver,
}: ColunaProps) {
  return (
    <div
      onDragOver={(e) => onDragOver(e, etapa)}
      onDrop={() => onDrop(etapa)}
      className={`border rounded-md ${bg} ${isOver ? "ring-2 ring-primary" : ""} transition-all`}
    >
      <div className="flex items-center justify-between p-2.5 border-b bg-card/50">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <Badge variant="outline" className="text-xs h-5">
          {leads.length}
        </Badge>
      </div>
      <div className="p-2 space-y-2 min-h-[400px] max-h-[70vh] overflow-y-auto">
        {leads.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6 italic">vazio</p>
        ) : (
          leads.map((l) => (
            <AcompanhamentoCard
              key={l.campanha_lead_id}
              lead={l}
              onClick={() => onLeadClick(l)}
              onDragStart={() => onDragStart(l.campanha_lead_id)}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
