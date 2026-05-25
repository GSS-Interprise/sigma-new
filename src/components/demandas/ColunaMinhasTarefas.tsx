import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import {
  useDemandasMinhasEnviadas,
  useDemandasParaMim,
  useAtualizarStatusDemanda,
  type DemandaTarefa,
} from "@/hooks/useDemandas";
import { TarefaCard } from "./TarefaCard";
import { NovaDemandaDialog } from "./NovaDemandaDialog";

interface Props {
  onTarefaClick?: (id: string) => void;
}

export function ColunaMinhasTarefas({ onTarefaClick }: Props) {
  const { data: enviadas = [], isLoading: l1 } = useDemandasMinhasEnviadas();
  const { data: paraMim = [], isLoading: l2 } = useDemandasParaMim();
  const concluir = useAtualizarStatusDemanda();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);

  const isLoading = l1 || l2;

  const tarefas = useMemo(() => {
    const map = new Map<string, DemandaTarefa>();
    [...enviadas, ...paraMim].forEach((t) => map.set(t.id, t));
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.data_limite && b.data_limite)
        return a.data_limite.localeCompare(b.data_limite);
      if (a.data_limite) return -1;
      if (b.data_limite) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
    return list;
  }, [enviadas, paraMim]);

  const abertas = tarefas.filter((t) => t.status !== "concluida");
  const concluidas = tarefas.filter((t) => t.status === "concluida");

  return (
    <Card className="flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Minhas tarefas</h3>
          <span className="text-[11px] text-muted-foreground">
            ({abertas.length} aberta{abertas.length === 1 ? "" : "s"})
          </span>
        </div>
        <div className="flex items-center gap-1">
          {concluidas.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={() => setMostrarConcluidas((v) => !v)}
            >
              {mostrarConcluidas ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {mostrarConcluidas ? "Ocultar" : "Concluídas"} ({concluidas.length})
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {isLoading && (
            <div className="text-xs text-muted-foreground text-center py-6">
              Carregando…
            </div>
          )}
          {!isLoading && tarefas.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-10">
              Sem tarefas. Clique em <b>Nova</b> para começar.
            </div>
          )}
          {abertas.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
              onReabrir={(id) => concluir.mutate({ id, status: "aberta" })}
              onClick={() => onTarefaClick?.(t.id)}
            />
          ))}
          {mostrarConcluidas && concluidas.length > 0 && (
            <div className="pt-3 mt-3 border-t">
              <p className="text-[11px] text-muted-foreground mb-2 px-1">
                Concluídas ({concluidas.length})
              </p>
              <div className="space-y-2">
                {concluidas.map((t) => (
                  <TarefaCard
                    key={t.id}
                    tarefa={t}
                    onClick={() => onTarefaClick?.(t.id)}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <NovaDemandaDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}