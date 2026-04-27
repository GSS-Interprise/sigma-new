import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus } from "lucide-react";
import { format, isPast, isSameDay, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDemandasDoSetor, useAtualizarStatusDemanda } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { TarefaCard } from "./TarefaCard";
import { NovaDemandaDialog } from "./NovaDemandaDialog";

interface Props {
  onTarefaClick?: (id: string) => void;
}

export function ColunaAgenda({ onTarefaClick }: Props) {
  const { setorId } = useUserSetor();
  const { data: tarefas = [] } = useDemandasDoSetor(setorId);
  const concluir = useAtualizarStatusDemanda();
  const [date, setDate] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);

  const tarefasDoDia = useMemo(
    () =>
      tarefas.filter(
        (t) => t.data_limite && isSameDay(parseISO(t.data_limite), date),
      ),
    [tarefas, date],
  );

  const diasComStatus = useMemo(() => {
    const map = new Map<string, "atrasada" | "ok">();
    tarefas.forEach((t) => {
      if (!t.data_limite) return;
      const key = format(startOfDay(parseISO(t.data_limite)), "yyyy-MM-dd");
      const atual = map.get(key);
      const atrasada =
        t.status !== "concluida" && isPast(parseISO(t.data_limite));
      if (atrasada) map.set(key, "atrasada");
      else if (!atual) map.set(key, "ok");
    });
    return map;
  }, [tarefas]);

  return (
    <Card className="flex flex-col h-full bg-gradient-to-b from-card to-card/60 backdrop-blur-sm">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Agenda</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-2">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && setDate(d)}
          locale={ptBR}
          className={cn("p-1 pointer-events-auto")}
          modifiers={{
            atrasada: (d) =>
              diasComStatus.get(format(d, "yyyy-MM-dd")) === "atrasada",
            ok: (d) => diasComStatus.get(format(d, "yyyy-MM-dd")) === "ok",
          }}
          modifiersClassNames={{
            atrasada:
              "relative after:content-[''] after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-destructive",
            ok: "relative after:content-[''] after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-green-500",
          }}
        />
      </div>

      <div className="px-3 py-2 border-t">
        <p className="text-xs text-muted-foreground">
          {format(date, "PPP", { locale: ptBR })} —{" "}
          <span className="font-semibold">{tarefasDoDia.length}</span> tarefa(s)
        </p>
      </div>
      <ScrollArea className="flex-1 px-2 pb-2">
        <div className="space-y-2">
          {tarefasDoDia.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">
              Nada agendado
            </div>
          )}
          {tarefasDoDia.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
              onClick={() => onTarefaClick?.(t.id)}
              compact
            />
          ))}
        </div>
      </ScrollArea>

      <NovaDemandaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDate={date}
      />
    </Card>
  );
}
