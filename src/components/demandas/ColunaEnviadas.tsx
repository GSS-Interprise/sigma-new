import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Send, Plus } from "lucide-react";
import { useState } from "react";
import { useDemandasMinhasEnviadas, useAtualizarStatusDemanda } from "@/hooks/useDemandas";
import { TarefaCard } from "./TarefaCard";
import { NovaDemandaDialog } from "./NovaDemandaDialog";

interface Props {
  onTarefaClick?: (id: string) => void;
}

export function ColunaEnviadas({ onTarefaClick }: Props) {
  const { data: tarefas = [], isLoading } = useDemandasMinhasEnviadas();
  const concluir = useAtualizarStatusDemanda();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card className="flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Enviadas por mim</h3>
          <span className="text-[11px] text-muted-foreground">
            ({tarefas.length})
          </span>
        </div>
        <Button
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Nova
        </Button>
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
              Você ainda não enviou demandas. Clique em <b>Nova</b> para começar.
            </div>
          )}
          {tarefas.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
              onClick={() => onTarefaClick?.(t.id)}
            />
          ))}
        </div>
      </ScrollArea>

      <NovaDemandaDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
