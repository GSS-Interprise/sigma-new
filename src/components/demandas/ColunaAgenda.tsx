import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  isPast,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDemandasDoSetor, useAtualizarStatusDemanda } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { TarefaCard } from "./TarefaCard";
import { NovaDemandaDialog } from "./NovaDemandaDialog";
import { DiaAgendaDialog } from "./DiaAgendaDialog";

interface Props {
  onTarefaClick?: (id: string) => void;
}

const WEEKDAYS = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB."];

export function ColunaAgenda({ onTarefaClick }: Props) {
  const { setorId } = useUserSetor();
  const { data: tarefas = [] } = useDemandasDoSetor(setorId);
  const concluir = useAtualizarStatusDemanda();
  const [date, setDate] = useState<Date>(new Date());
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [dayDialogDate, setDayDialogDate] = useState<Date | null>(null);

  // Build 6-week grid for the visible month
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 0 });
    const out: Date[] = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [monthCursor]);

  // Tasks indexed by yyyy-mm-dd
  const tarefasPorDia = useMemo(() => {
    const map = new Map<string, typeof tarefas>();
    tarefas.forEach((t) => {
      if (!t.data_limite) return;
      const key = format(parseISO(t.data_limite), "yyyy-MM-dd");
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    });
    return map;
  }, [tarefas]);

  const tarefasDoDia = useMemo(
    () =>
      tarefas.filter(
        (t) => t.data_limite && isSameDay(parseISO(t.data_limite), date),
      ),
    [tarefas, date],
  );

  return (
    <Card className="flex flex-col h-full overflow-hidden rounded-2xl border-border/70 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-bold text-sm tracking-tight">Agenda</h3>
        </div>
        <Button
          size="sm"
          className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg"
          onClick={() => setMonthCursor((d) => subMonths(d, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-bold uppercase tracking-widest text-foreground/80">
          {format(monthCursor, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-lg"
          onClick={() => setMonthCursor((d) => addMonths(d, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 px-1.5 pt-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 text-center">
            {w.replace(".", "")}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-[320px] gap-0.5 p-1.5">
        {days.map((d, i) => {
          const key = format(d, "yyyy-MM-dd");
          const eventos = tarefasPorDia.get(key) || [];
          const fora = !isSameMonth(d, monthCursor);
          const sel = isSameDay(d, date);
          const hoje = isToday(d);
          const temAtrasada = eventos.some(
            (t) =>
              t.status !== "concluida" &&
              t.data_limite &&
              isPast(parseISO(t.data_limite)) &&
              !isToday(parseISO(t.data_limite)),
          );
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDate(d);
                setDayDialogDate(d);
                setDayDialogOpen(true);
              }}
              className={cn(
                "relative text-left p-1 overflow-hidden rounded-lg transition-all group",
                fora && "opacity-40",
                !fora && !sel && !hoje && "hover:bg-accent/50",
                !fora && temAtrasada && "bg-red-600 hover:bg-red-700 text-white",
                sel && !hoje && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                sel && temAtrasada && "ring-2 ring-inset ring-red-800",
              )}
            >
              <div className="flex items-center justify-start">
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-[11px] font-bold h-6 min-w-6 px-1.5 rounded-full",
                    hoje && "bg-primary text-primary-foreground shadow-md shadow-primary/30",
                    !hoje && !temAtrasada && "text-foreground",
                    !hoje && temAtrasada && "text-white",
                    fora && "text-muted-foreground/50",
                  )}
                >
                  {format(d, d.getDate() === 1 ? "d 'de' MMM" : "d", {
                    locale: ptBR,
                  })}
                </span>
              </div>
              {eventos.length > 0 && (
                <div className="mt-0.5 flex items-center gap-1">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      temAtrasada ? "bg-white" : "bg-emerald-500",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[9px] font-bold",
                      temAtrasada ? "text-white" : "text-muted-foreground",
                    )}
                  >
                    {eventos.length}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <NovaDemandaDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setDialogDate(null);
        }}
        defaultDate={dialogDate ?? date}
      />

      <DiaAgendaDialog
        open={dayDialogOpen}
        onOpenChange={setDayDialogOpen}
        date={dayDialogDate}
        tarefas={
          dayDialogDate
            ? tarefas.filter(
                (t) =>
                  t.data_limite &&
                  isSameDay(parseISO(t.data_limite), dayDialogDate),
              )
            : []
        }
        onNovaTarefa={(d) => {
          setDialogDate(d);
          setDialogOpen(true);
        }}
        onTarefaClick={onTarefaClick}
      />
    </Card>
  );
}