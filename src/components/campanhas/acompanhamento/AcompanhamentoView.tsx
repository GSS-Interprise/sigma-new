import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AcompanhamentoKanban } from "./AcompanhamentoKanban";
import { AcompanhamentoLeadPainel } from "./AcompanhamentoLeadPainel";
import { AcompanhamentoAgingBanner } from "./AcompanhamentoAgingBanner";
import { AiSupervisionQueue } from "./AiSupervisionQueue";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAcompanhamentoLeads,
  type AcompanhamentoLead,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";

const FILTRO_STORAGE_KEY = "acompanhamento-filtro";
const AGING_THRESHOLD_STORAGE_KEY = "acompanhamento-aging-threshold";

const THRESHOLD_OPCOES = [
  { value: 6, label: "6 horas" },
  { value: 12, label: "12 horas" },
  { value: 24, label: "24 horas" },
  { value: 48, label: "48 horas" },
];

function carregarAgingThresholdInicial(): number {
  if (typeof window !== "undefined") {
    const saved = parseInt(localStorage.getItem(AGING_THRESHOLD_STORAGE_KEY) || "", 10);
    if (!Number.isNaN(saved) && THRESHOLD_OPCOES.some((o) => o.value === saved)) {
      return saved;
    }
  }
  return 12;
}

function carregarFiltroInicial(isAdmin: boolean): FiltroAcompanhamento {
  // Persistido no localStorage tem prioridade (preferência explícita do user)
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(FILTRO_STORAGE_KEY);
    if (saved && ["todos", "minha_fila", "sem_dono", "aguarda_maikon", "aguarda_equipe"].includes(saved)) {
      return saved as FiltroAcompanhamento;
    }
  }
  // Default por role (F2.10): admin vê tudo, operadora vê só dela
  return isAdmin ? "todos" : "minha_fila";
}

export function AcompanhamentoView() {
  const { isAdmin } = usePermissions();
  const [filtro, setFiltro] = useState<FiltroAcompanhamento>(() => carregarFiltroInicial(isAdmin));
  const [agingThreshold, setAgingThreshold] = useState<number>(() => carregarAgingThresholdInicial());
  const [leadAberto, setLeadAberto] = useState<AcompanhamentoLead | null>(null);
  const { counts, todosLeads, isLoading } = useAcompanhamentoLeads(filtro);

  // Persiste mudanças no localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FILTRO_STORAGE_KEY, filtro);
    }
  }, [filtro]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(AGING_THRESHOLD_STORAGE_KEY, String(agingThreshold));
    }
  }, [agingThreshold]);

  // Pega lead atualizado do todosLeads (após mutações)
  const leadAtualizado = leadAberto
    ? todosLeads.find((l) => l.campanha_lead_id === leadAberto.campanha_lead_id) || null
    : null;

  return (
    <div className="space-y-3">
      <AiSupervisionQueue
        onOpenLead={(campanhaLeadId) => {
          const lead = todosLeads.find((item) => item.campanha_lead_id === campanhaLeadId);
          if (lead) setLeadAberto(lead);
        }}
      />

      {/* F3.4 — Banner de aging de leads quentes (threshold configurável) */}
      <AcompanhamentoAgingBanner
        leads={todosLeads}
        thresholdHoras={agingThreshold}
        onLeadClick={setLeadAberto}
      />

      {/* F3.4 — Seletor de threshold (persistido em localStorage) */}
      <div className="flex items-center justify-end gap-2 text-xs">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Alertar quentes esperando há mais de:</span>
        <Select
          value={String(agingThreshold)}
          onValueChange={(v) => setAgingThreshold(Number(v))}
        >
          <SelectTrigger className="min-h-11 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THRESHOLD_OPCOES.map((o) => (
              <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtros chip */}
      <div className="flex flex-wrap gap-1.5">
        <FiltroChip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
          Todos <span className="opacity-60 ml-1">{counts.total}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "minha_fila"} onClick={() => setFiltro("minha_fila")}>
          Minha fila <span className="opacity-60 ml-1">{counts.minha_fila}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "sem_dono"} onClick={() => setFiltro("sem_dono")}>
          Sem dono <span className="opacity-60 ml-1">{counts.sem_dono}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "aguarda_maikon"} onClick={() => setFiltro("aguarda_maikon")}>
          Aguarda Maikon <span className="opacity-60 ml-1">{counts.aguarda_maikon}</span>
        </FiltroChip>
        <FiltroChip ativo={filtro === "aguarda_equipe"} onClick={() => setFiltro("aguarda_equipe")}>
          Aguarda equipe <span className="opacity-60 ml-1">{counts.aguarda_equipe}</span>
        </FiltroChip>
      </div>

      {/* Estado vazio */}
      {!isLoading && todosLeads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum lead em acompanhamento ainda.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Os leads aparecem aqui conforme avançam nas campanhas e no atendimento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AcompanhamentoKanban filtro={filtro} onLeadClick={setLeadAberto} />
      )}

      <AcompanhamentoLeadPainel lead={leadAtualizado} onClose={() => setLeadAberto(null)} />
    </div>
  );
}

function FiltroChip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 text-xs px-3 py-1.5 rounded-full border transition-colors ${
        ativo
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
