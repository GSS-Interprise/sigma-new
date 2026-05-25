import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ListChecks, Eye, Hourglass, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TarefaCard } from "./TarefaCard";
import {
  useDemandasTodas,
  useAtualizarStatusDemanda,
  type DemandaTarefa,
} from "@/hooks/useDemandas";

type StatusKanban = "aberta" | "em_analise" | "aguardando" | "concluida";

interface ColunaDef {
  status: StatusKanban;
  label: string;
  icon: typeof ListChecks;
  headerClass: string;
  ringClass: string;
  dotClass: string;
}

const COLUNAS: ColunaDef[] = [
  {
    status: "aberta",
    label: "Todas as tarefas",
    icon: ListChecks,
    headerClass: "from-primary/10 to-transparent border-primary/30",
    ringClass: "ring-primary/50",
    dotClass: "bg-primary",
  },
  {
    status: "em_analise",
    label: "Em análise",
    icon: Eye,
    headerClass:
      "from-blue-500/10 to-transparent border-blue-500/30 dark:from-blue-400/10 dark:border-blue-400/30",
    ringClass: "ring-blue-500/60",
    dotClass: "bg-blue-500",
  },
  {
    status: "aguardando",
    label: "Aguardando",
    icon: Hourglass,
    headerClass:
      "from-amber-500/10 to-transparent border-amber-500/30 dark:from-amber-400/10 dark:border-amber-400/30",
    ringClass: "ring-amber-500/60",
    dotClass: "bg-amber-500",
  },
  {
    status: "concluida",
    label: "Finalizado",
    icon: CheckCircle2,
    headerClass:
      "from-emerald-500/10 to-transparent border-emerald-500/30 dark:from-emerald-400/10 dark:border-emerald-400/30",
    ringClass: "ring-emerald-500/60",
    dotClass: "bg-emerald-500",
  },
];

interface Props {
  onTarefaClick?: (id: string) => void;
}

export function KanbanTarefas({ onTarefaClick }: Props) {
  const { data: tarefas = [], isLoading } = useDemandasTodas();
  const atualizarStatus = useAtualizarStatusDemanda();
  const [overCol, setOverCol] = useState<StatusKanban | null>(null);
  const [pendingFinalizar, setPendingFinalizar] = useState<DemandaTarefa | null>(null);

  const grupos = useMemo(() => {
    const map: Record<StatusKanban, DemandaTarefa[]> = {
      aberta: [],
      em_analise: [],
      aguardando: [],
      concluida: [],
    };
    for (const t of tarefas) {
      const s = (t.status as StatusKanban) ?? "aberta";
      if (map[s]) map[s].push(t);
      else map.aberta.push(t);
    }
    const sortFn = (a: DemandaTarefa, b: DemandaTarefa) => {
      if (a.data_limite && b.data_limite)
        return a.data_limite.localeCompare(b.data_limite);
      if (a.data_limite) return -1;
      if (b.data_limite) return 1;
      return b.created_at.localeCompare(a.created_at);
    };
    (Object.keys(map) as StatusKanban[]).forEach((k) => map[k].sort(sortFn));
    return map;
  }, [tarefas]);

  const handleDrop = (status: StatusKanban, tarefaId: string) => {
    setOverCol(null);
    const tarefa = tarefas.find((t) => t.id === tarefaId);
    if (!tarefa) return;
    if (tarefa.status === status) return;
    if (status === "concluida") {
      setPendingFinalizar(tarefa);
      return;
    }
    atualizarStatus.mutate({ id: tarefaId, status });
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 h-full">
        {COLUNAS.map((col) => {
          const Icon = col.icon;
          const lista = grupos[col.status];
          const ativo = overCol === col.status;
          return (
            <Card
              key={col.status}
              className={cn(
                "flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm transition-all min-h-0",
                ativo && cn("ring-2", col.ringClass),
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.status) setOverCol(col.status);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/tarefa-id");
                if (id) handleDrop(col.status, id);
              }}
            >
              <div
                className={cn(
                  "p-3 border-b bg-gradient-to-r flex items-center justify-between gap-2",
                  col.headerClass,
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", col.dotClass)} />
                  <Icon className="h-4 w-4" />
                  <h3 className="font-semibold text-sm">{col.label}</h3>
                </div>
                <Badge variant="outline" className="text-[11px]">
                  {lista.length}
                </Badge>
              </div>
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2 min-h-[60px]">
                  {isLoading && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      Carregando…
                    </div>
                  )}
                  {!isLoading && lista.length === 0 && (
                    <div
                      className={cn(
                        "text-xs text-muted-foreground text-center py-8 rounded-md border border-dashed",
                        ativo && "border-primary/60 bg-primary/5 text-primary",
                      )}
                    >
                      {ativo ? "Solte aqui" : "Arraste tarefas para cá"}
                    </div>
                  )}
                  {lista.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/tarefa-id", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <TarefaCard
                        tarefa={t}
                        onClick={() => onTarefaClick?.(t.id)}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          );
        })}
      </div>

      <AlertDialog
        open={!!pendingFinalizar}
        onOpenChange={(open) => !open && setPendingFinalizar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingFinalizar?.titulo
                ? `"${pendingFinalizar.titulo}" será marcada como concluída.`
                : "A tarefa será marcada como concluída."}
              {" "}
              Apenas administradores poderão reabri-la depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingFinalizar) {
                  atualizarStatus.mutate({
                    id: pendingFinalizar.id,
                    status: "concluida",
                  });
                }
                setPendingFinalizar(null);
              }}
            >
              Finalizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}