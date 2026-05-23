import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { AcompanhamentoKanban } from "./AcompanhamentoKanban";
import { AcompanhamentoLeadPainel } from "./AcompanhamentoLeadPainel";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAcompanhamentoLeads,
  type AcompanhamentoLead,
  type FiltroAcompanhamento,
} from "@/hooks/useAcompanhamentoLeads";

const FILTRO_STORAGE_KEY = "acompanhamento-filtro";

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
  const [leadAberto, setLeadAberto] = useState<AcompanhamentoLead | null>(null);
  const { counts, todosLeads, isLoading } = useAcompanhamentoLeads(filtro);

  // Persiste mudanças no localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FILTRO_STORAGE_KEY, filtro);
    }
  }, [filtro]);

  // Pega lead atualizado do todosLeads (após mutações)
  const leadAtualizado = leadAberto
    ? todosLeads.find((l) => l.campanha_lead_id === leadAberto.campanha_lead_id) || null
    : null;

  return (
    <div className="space-y-3">
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
              Quando a IA marcar um lead como quente, ele aparece aqui.
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
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        ativo
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
