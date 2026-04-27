import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox } from "lucide-react";
import { useDemandasParaMim, useAtualizarStatusDemanda } from "@/hooks/useDemandas";
import { TarefaCard } from "./TarefaCard";

interface Props {
  onTarefaClick?: (id: string) => void;
}

export function ColunaParaMim({ onTarefaClick }: Props) {
  const { data: tarefas = [], isLoading } = useDemandasParaMim();
  const concluir = useAtualizarStatusDemanda();

  const abertas = tarefas.filter((t) => t.status !== "concluida");
  const concluidas = tarefas.filter((t) => t.status === "concluida");

  return (
    <Card className="flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center gap-2">
        <Inbox className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Para mim</h3>
        <span className="text-[11px] text-muted-foreground">
          ({abertas.length} aberta{abertas.length === 1 ? "" : "s"})
        </span>
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
              Nenhuma tarefa atribuída a você.
            </div>
          )}
          {abertas.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
              onClick={() => onTarefaClick?.(t.id)}
            />
          ))}
          {concluidas.length > 0 && (
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
    </Card>
  );
}
