import { useMemo, useState } from "react";
import {
  ArrowRightToLine,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  Clock,
  Handshake,
  MessageCircleReply,
  PhoneOutgoing,
  UserCheck,
  UserRoundPlus,
  X,
  XCircle,
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
  useAprovarLead,
  useMarcarPerdido,
  useMoverEtapa,
  type AcompanhamentoLead,
  type EtapaCrm,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";
import { useLeadsCrossCampanha } from "@/hooks/useLeadsCrossCampanha";

interface Props {
  filtro: FiltroAcompanhamento;
  onLeadClick: (lead: AcompanhamentoLead) => void;
}

const COLUNAS: Array<{
  etapa: Exclude<EtapaCrm, "perdido">;
  label: string;
  descricao: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = [
  { etapa: "novo", label: "Novo", descricao: "Ainda não contatado", icon: UserRoundPlus, color: "text-slate-600", bg: "bg-slate-50" },
  { etapa: "contatado", label: "Contatado", descricao: "Aguardando resposta", icon: PhoneOutgoing, color: "text-violet-600", bg: "bg-violet-50" },
  { etapa: "respondeu", label: "Respondeu", descricao: "Aguardando responsável", icon: MessageCircleReply, color: "text-orange-600", bg: "bg-orange-50" },
  { etapa: "em_atendimento", label: "Em atendimento", descricao: "Conversa assumida", icon: UserCheck, color: "text-cyan-700", bg: "bg-cyan-50" },
  { etapa: "qualificado", label: "Qualificado", descricao: "Interesse e requisitos", icon: CircleDot, color: "text-amber-700", bg: "bg-amber-50" },
  { etapa: "encaminhado", label: "Encaminhado", descricao: "Avançou na oportunidade", icon: ArrowRightToLine, color: "text-blue-700", bg: "bg-blue-50" },
  { etapa: "convertido", label: "Convertido", descricao: "Enviado para Contratos", icon: Handshake, color: "text-emerald-700", bg: "bg-emerald-50" },
];

const ETAPAS_AUTOMATICAS = new Set<EtapaCrm>([
  "novo",
  "contatado",
  "respondeu",
  "em_atendimento",
]);

export function AcompanhamentoKanban({ filtro, onLeadClick }: Props) {
  const { porEtapaCrm, todosLeads, isLoading } = useAcompanhamentoLeads(filtro);
  const [perdidoExpanded, setPerdidoExpanded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverEtapa, setDragOverEtapa] = useState<EtapaCrm | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const moverEtapa = useMoverEtapa();
  const aprovarLead = useAprovarLead();
  const marcarPerdido = useMarcarPerdido();

  const leadIds = useMemo(() => todosLeads.map((lead) => lead.lead_id), [todosLeads]);
  const { data: crossCampanhasMap } = useLeadsCrossCampanha(leadIds);

  const toggleSelect = (campanhaLeadId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(campanhaLeadId)) next.delete(campanhaLeadId);
      else next.add(campanhaLeadId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const moverParaEtapaComercial = async (campanhaLeadId: string, etapa: EtapaCrm) => {
    if (ETAPAS_AUTOMATICAS.has(etapa)) {
      throw new Error("Essa etapa muda automaticamente conforme contato, resposta e assunção.");
    }
    if (etapa === "qualificado") {
      return moverEtapa.mutateAsync({ campanha_lead_id: campanhaLeadId, etapa: "quente" });
    }
    if (etapa === "encaminhado") return aprovarLead.mutateAsync(campanhaLeadId);
    if (etapa === "convertido") {
      return moverEtapa.mutateAsync({ campanha_lead_id: campanhaLeadId, etapa: "na_escala" });
    }
    return marcarPerdido.mutateAsync({
      campanha_lead_id: campanhaLeadId,
      motivo: "Marcado em massa pelo funil comercial",
    });
  };

  const bulkMover = async (etapa: EtapaCrm) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    let sucessos = 0;
    let falhas = 0;
    const erros: string[] = [];
    for (const id of selectedIds) {
      try {
        await moverParaEtapaComercial(id, etapa);
        sucessos += 1;
      } catch (error) {
        falhas += 1;
        if (erros.length < 2) erros.push(error instanceof Error ? error.message : "Erro inesperado");
      }
    }
    setBulkBusy(false);
    if (falhas === 0) {
      toast.success(`${sucessos} lead(s) atualizados`);
      clearSelection();
    } else {
      toast.warning(`${sucessos} atualizados, ${falhas} falharam. ${erros.join(" ")}`);
    }
  };

  const handleDrop = async (etapa: EtapaCrm) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOverEtapa(null);
    if (!id) return;
    const lead = todosLeads.find((item) => item.campanha_lead_id === id);
    if (!lead || lead.etapa_crm === etapa) return;
    try {
      await moverParaEtapaComercial(id, etapa);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível mover o lead");
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUNAS.slice(0, 4).map((coluna) => (
          <div key={coluna.etapa} className="min-h-72 animate-pulse rounded-md border bg-muted/20" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span>Contato, resposta e assunção movem o card automaticamente.</span>
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {COLUNAS.map((coluna) => (
            <Coluna
              key={coluna.etapa}
              {...coluna}
              leads={porEtapaCrm[coluna.etapa] || []}
              crossCampanhasMap={crossCampanhasMap}
              onLeadClick={onLeadClick}
              onDragStart={setDraggingId}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverEtapa(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverEtapa(coluna.etapa);
              }}
              onDrop={() => void handleDrop(coluna.etapa)}
              isOver={dragOverEtapa === coluna.etapa}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-lg border bg-background p-3 shadow-lg sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2">
          <div className="flex min-h-11 items-center gap-1.5 px-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="min-h-11" disabled={bulkBusy}>
                Avançar para...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => void bulkMover("qualificado")}>Qualificado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void bulkMover("encaminhado")}>Encaminhado</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void bulkMover("convertido")}>Convertido</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={bulkBusy}
            onClick={() => void bulkMover("perdido")}
          >
            <XCircle className="mr-1.5 h-4 w-4" /> Perdido
          </Button>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={clearSelection} disabled={bulkBusy}>
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        </div>
      )}

      <div className="mt-1 rounded-md border bg-muted/20">
        <button
          type="button"
          onClick={() => setPerdidoExpanded((open) => !open)}
          className="flex min-h-11 w-full items-center justify-between p-3 transition-colors hover:bg-muted/30"
        >
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium">Perdidos</span>
            <Badge variant="outline" className="text-xs">{porEtapaCrm.perdido.length}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{perdidoExpanded ? "Ocultar" : "Mostrar"}</span>
        </button>
        {perdidoExpanded && (
          <div className="grid grid-cols-1 gap-2 border-t p-2 sm:grid-cols-2 lg:grid-cols-4">
            {porEtapaCrm.perdido.length === 0 ? (
              <p className="py-4 text-center text-xs italic text-muted-foreground">Nenhum lead perdido.</p>
            ) : (
              porEtapaCrm.perdido.map((lead) => (
                <AcompanhamentoCard
                  key={lead.campanha_lead_id}
                  lead={lead}
                  crossCampanhas={crossCampanhasMap?.get(lead.lead_id)}
                  onClick={() => onLeadClick(lead)}
                  onDragStart={() => setDraggingId(lead.campanha_lead_id)}
                  onDragEnd={() => setDraggingId(null)}
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
  etapa: Exclude<EtapaCrm, "perdido">;
  label: string;
  descricao: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  leads: AcompanhamentoLead[];
  crossCampanhasMap?: Map<string, Array<{ id: string; nome: string }>>;
  onLeadClick: (lead: AcompanhamentoLead) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: () => void;
  isOver: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

function Coluna({
  etapa,
  label,
  descricao,
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
  const automatica = ETAPAS_AUTOMATICAS.has(etapa);
  return (
    <section
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`w-[min(82vw,19rem)] shrink-0 rounded-md border ${bg} ${isOver ? "ring-2 ring-primary" : ""}`}
      aria-label={`Etapa ${label}`}
    >
      <header className="border-b bg-card/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <span className="truncate text-sm font-medium">{label}</span>
          </div>
          <Badge variant="outline" className="h-5 text-xs">{leads.length}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {descricao}{automatica ? " · automático" : ""}
        </p>
      </header>
      <div className="max-h-[65dvh] min-h-72 space-y-2 overflow-y-auto p-2">
        {leads.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-muted-foreground">Vazio</p>
        ) : (
          leads.map((lead) => (
            <AcompanhamentoCard
              key={lead.campanha_lead_id}
              lead={lead}
              crossCampanhas={crossCampanhasMap?.get(lead.lead_id)}
              onClick={() => onLeadClick(lead)}
              onDragStart={() => onDragStart(lead.campanha_lead_id)}
              onDragEnd={onDragEnd}
              selected={selectedIds.has(lead.campanha_lead_id)}
              onToggleSelect={() => onToggleSelect(lead.campanha_lead_id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
