import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Flame,
  ClipboardCheck,
  CheckCircle2,
  Calendar,
  XCircle,
  X,
  CheckSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AcompanhamentoCard } from "./AcompanhamentoCard";
import {
  useAcompanhamentoLeads,
  useMoverEtapa,
  useAprovarLead,
  useMarcarPerdido,
  type EtapaAcompanhamento,
  type AcompanhamentoLead,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";
import { useLeadsCrossCampanha } from "@/hooks/useLeadsCrossCampanha";

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
  // Bloco C — bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const moverEtapa = useMoverEtapa();
  const aprovarLead = useAprovarLead();
  const marcarPerdido = useMarcarPerdido();

  const toggleSelect = (campanhaLeadId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(campanhaLeadId)) next.delete(campanhaLeadId);
      else next.add(campanhaLeadId);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const bulkMover = async (etapa: EtapaAcompanhamento) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    let fail = 0;
    const erros: string[] = [];
    for (const id of ids) {
      try {
        if (etapa === "aprovado") {
          await aprovarLead.mutateAsync(id);
        } else {
          await moverEtapa.mutateAsync({ campanha_lead_id: id, etapa });
        }
        ok++;
      } catch (e: any) {
        fail++;
        if (erros.length < 3) erros.push(e?.message || "erro");
      }
    }
    setBulkBusy(false);
    if (fail === 0) {
      toast.success(`${ok} lead(s) movidos pra ${etapa.replace("_", " ")}`);
      clearSelection();
    } else {
      toast.warning(`${ok} movidos, ${fail} falharam — ${erros.join("; ")}`);
    }
  };

  const bulkPerdido = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        await marcarPerdido.mutateAsync({
          campanha_lead_id: id,
          motivo: "Marcado em massa via Kanban",
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(false);
    if (fail === 0) {
      toast.success(`${ok} lead(s) marcados como perdido`);
      clearSelection();
    } else {
      toast.warning(`${ok} marcados, ${fail} falharam`);
    }
  };

  // F2.7 — busca em qual outras campanhas cada lead está, pra mostrar badge "em N campanhas"
  const leadIds = useMemo(() => todosLeads.map((l) => l.lead_id), [todosLeads]);
  const { data: crossCampanhasMap } = useLeadsCrossCampanha(leadIds);

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
            crossCampanhasMap={crossCampanhasMap}
            onLeadClick={onLeadClick}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            isOver={dragOverEtapa === col.etapa}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {/* Bloco C — barra flutuante de bulk actions */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-lg px-3 py-2 flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-1.5 px-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium tabular-nums">
              {selectedIds.size} selecionado{selectedIds.size === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={bulkBusy}>
                Mover para...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => bulkMover("quente")}>
                <Flame className="h-3.5 w-3.5 mr-2 text-red-600" /> Quente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkMover("em_analise")}>
                <ClipboardCheck className="h-3.5 w-3.5 mr-2 text-amber-600" /> Em análise
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkMover("aprovado")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-blue-600" /> Aprovado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => bulkMover("na_escala")}>
                <Calendar className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Na escala
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            onClick={bulkPerdido}
            disabled={bulkBusy}
            className="text-destructive hover:text-destructive"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Perdido
          </Button>
          <div className="h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy}>
            <X className="h-3.5 w-3.5 mr-1" />
            Limpar
          </Button>
        </div>
      )}

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
                  crossCampanhas={crossCampanhasMap?.get(l.lead_id)}
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
  crossCampanhasMap?: Map<string, Array<{ id: string; nome: string }>>;
  onLeadClick: (lead: AcompanhamentoLead) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, etapa: EtapaAcompanhamento) => void;
  onDrop: (etapa: EtapaAcompanhamento) => void;
  isOver: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

function Coluna({
  etapa,
  label,
  icon: Icon,
  color,
  bg,
  leads,
  crossCampanhasMap,
  onLeadClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isOver,
  selectedIds,
  onToggleSelect,
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
              crossCampanhas={crossCampanhasMap?.get(l.lead_id)}
              onClick={() => onLeadClick(l)}
              onDragStart={() => onDragStart(l.campanha_lead_id)}
              onDragEnd={onDragEnd}
              selected={selectedIds.has(l.campanha_lead_id)}
              onToggleSelect={() => onToggleSelect(l.campanha_lead_id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
