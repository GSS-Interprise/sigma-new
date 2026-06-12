import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DemandaTarefa } from "@/hooks/useDemandas";
import { useAtualizarStatusDemanda } from "@/hooks/useDemandas";
import { TarefaCard } from "./TarefaCard";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  date: Date | null;
  tarefas: DemandaTarefa[];
  onNovaTarefa: (d: Date) => void;
  onTarefaClick?: (id: string) => void;
}

export function DiaAgendaDialog({
  open,
  onOpenChange,
  date,
  tarefas,
  onNovaTarefa,
  onTarefaClick,
}: Props) {
  const concluir = useAtualizarStatusDemanda();
  if (!date) return null;

  // ordena por hora (NULLS LAST)
  const ordenadas = [...tarefas].sort((a, b) => {
    const ha = a.data_limite_hora ?? "99:99";
    const hb = b.data_limite_hora ?? "99:99";
    return ha.localeCompare(hb);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base capitalize">
            <CalendarDays className="h-4 w-4 text-primary" />
            {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </DialogTitle>
          <DialogDescription>
            {ordenadas.length} tarefa(s) e compromisso(s) neste dia.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-4 py-3">
          <div className="space-y-2">
            {ordenadas.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nada agendado para este dia.
              </p>
            )}
            {ordenadas.map((t) => (
              <TarefaCard
                key={t.id}
                tarefa={t}
                onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
                onReabrir={(id) => concluir.mutate({ id, status: "aberta" })}
                onClick={() => {
                  onTarefaClick?.(t.id);
                  onOpenChange(false);
                }}
              />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t bg-muted/20 px-4 py-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              onNovaTarefa(date);
              onOpenChange(false);
            }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Nova tarefa neste dia
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}