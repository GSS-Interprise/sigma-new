import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Link2, Unlink, RefreshCw } from "lucide-react";
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
import { useDemandasDoSetor } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { NovaDemandaDialog } from "./NovaDemandaDialog";
import { DiaAgendaDialog } from "./DiaAgendaDialog";
import { GoogleEventDialog } from "./GoogleEventDialog";
import { DiaGoogleDialog } from "./DiaGoogleDialog";
import {
  useGoogleConnection,
  useGoogleCalendarEvents,
  useStartGoogleOAuth,
  useDisconnectGoogle,
  type GCalEvent,
} from "@/hooks/useGoogleCalendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  onTarefaClick?: (id: string) => void;
}

const WEEKDAYS = ["DOM.", "SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB."];

export function ColunaAgenda({ onTarefaClick }: Props) {
  const { setorId } = useUserSetor();
  const [date, setDate] = useState<Date>(new Date());
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [dayDialogOpen, setDayDialogOpen] = useState(false);
  const [dayDialogDate, setDayDialogDate] = useState<Date | null>(null);
  const [source, setSource] = useState<"agenda" | "google">("agenda");
  const [gEventOpen, setGEventOpen] = useState(false);
  const [gEventDate, setGEventDate] = useState<Date | null>(null);
  const [gDayOpen, setGDayOpen] = useState(false);
  const [gDayDate, setGDayDate] = useState<Date | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const mesVisivel = useMemo(
    () => ({ inicio: startOfMonth(monthCursor), fim: endOfMonth(monthCursor) }),
    [monthCursor],
  );
  const { data: tarefas = [] } = useDemandasDoSetor(
    setorId,
    mesVisivel.inicio,
    mesVisivel.fim,
  );

  const { data: gConn } = useGoogleConnection();
  const startOAuth = useStartGoogleOAuth();
  const disconnect = useDisconnectGoogle();
  const isGoogle = source === "google";
  const googleEnabled = isGoogle && !!gConn?.connected;
  const { data: gEvents = [], refetch: refetchGoogle, isFetching: gFetching } =
    useGoogleCalendarEvents(googleEnabled, mesVisivel.inicio, mesVisivel.fim);

  // Build 6-week grid for the visible month
  const days = useMemo(() => {
    const start = startOfWeek(mesVisivel.inicio, { weekStartsOn: 0 });
    const end = endOfWeek(mesVisivel.fim, { weekStartsOn: 0 });
    const out: Date[] = [];
    let cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }, [mesVisivel]);

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

  const googlePorDia = useMemo(() => {
    const map = new Map<string, GCalEvent[]>();
    gEvents.forEach((ev) => {
      const s = ev.start?.dateTime ?? ev.start?.date;
      if (!s) return;
      const key = format(new Date(s), "yyyy-MM-dd");
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    });
    return map;
  }, [gEvents]);

  return (
    <Card className="flex flex-col h-full overflow-hidden rounded-2xl border-border/70 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setSource("agenda")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors",
                !isGoogle
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => {
                setSource("google");
                if (!gConn?.connected) setConnectOpen(true);
              }}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors",
                isGoogle
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Google Calendar
            </button>
          </div>
        </div>
        <Button
          size="sm"
          className="h-7 w-7 p-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          onClick={() => {
            if (isGoogle) {
              if (!gConn?.connected) {
                setConnectOpen(true);
                return;
              }
              setGEventDate(date);
              setGEventOpen(true);
            } else {
              setDialogOpen(true);
            }
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Google Calendar connection info */}
      {isGoogle && gConn?.connected && (
        <div className="px-3 pt-2 pb-1">
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">{gConn.email}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetchGoogle()}
                className="hover:text-foreground"
                title="Atualizar"
              >
                <RefreshCw className={cn("h-3 w-3", gFetching && "animate-spin")} />
              </button>
              <button
                onClick={() => disconnect.mutate()}
                className="hover:text-foreground"
                title="Desconectar"
              >
                <Unlink className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

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
          const eventos = isGoogle
            ? googlePorDia.get(key) || []
            : tarefasPorDia.get(key) || [];
          const fora = !isSameMonth(d, monthCursor);
          const sel = isSameDay(d, date);
          const hoje = isToday(d);
          const temAtrasada = isGoogle
            ? false
            : (eventos as typeof tarefas).some(
                (t) =>
                  t.status !== "concluida" &&
                  t.data_limite &&
                  isPast(parseISO(t.data_limite)) &&
                  !isToday(parseISO(t.data_limite)),
              );
          const temGoogle = isGoogle && eventos.length > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setDate(d);
                if (isGoogle) {
                  if (!gConn?.connected) {
                    setConnectOpen(true);
                    return;
                  }
                  setGDayDate(d);
                  setGDayOpen(true);
                } else {
                  setDayDialogDate(d);
                  setDayDialogOpen(true);
                }
              }}
              className={cn(
                "relative text-left p-1 overflow-hidden rounded-lg transition-all group",
                fora && "opacity-40",
                !fora && !sel && !hoje && "hover:bg-accent/50",
                !fora && temAtrasada && "bg-red-600 hover:bg-red-700 text-white",
                !fora && temGoogle && "bg-blue-600 hover:bg-blue-700 text-white",
                sel && !hoje && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                sel && temAtrasada && "ring-2 ring-inset ring-red-800",
                sel && temGoogle && "ring-2 ring-inset ring-blue-800",
              )}
            >
              <div className="flex items-center justify-start">
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-[11px] font-bold h-6 min-w-6 px-1.5 rounded-full",
                    hoje && "bg-primary text-primary-foreground shadow-md shadow-primary/30",
                    !hoje && !temAtrasada && !temGoogle && "text-foreground",
                    !hoje && temAtrasada && "text-white",
                    !hoje && temGoogle && "text-white",
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
                      temAtrasada || temGoogle ? "bg-white" : "bg-emerald-500",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[9px] font-bold",
                      temAtrasada || temGoogle ? "text-white" : "text-muted-foreground",
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

      <GoogleEventDialog
        open={gEventOpen}
        onOpenChange={setGEventOpen}
        defaultDate={gEventDate}
      />

      <DiaGoogleDialog
        open={gDayOpen}
        onOpenChange={setGDayOpen}
        date={gDayDate}
        events={
          gDayDate
            ? gEvents.filter((ev) => {
                const s = ev.start?.dateTime ?? ev.start?.date;
                return s && isSameDay(new Date(s), gDayDate);
              })
            : []
        }
        onNovo={(d) => {
          setGEventDate(d);
          setGEventOpen(true);
        }}
      />

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar Google Calendar</DialogTitle>
            <DialogDescription>
              {gConn?.hasConfig
                ? "Faça login com sua conta Google para ver e criar eventos."
                : "Peça ao administrador para cadastrar seu Client ID e Client Secret do Google nas configurações de usuário."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConnectOpen(false)}>Fechar</Button>
            {gConn?.hasConfig && (
              <Button
                onClick={async () => {
                  setConnectOpen(false);
                  await startOAuth.mutateAsync();
                }}
                disabled={startOAuth.isPending}
              >
                <Link2 className="h-4 w-4 mr-1" />
                {startOAuth.isPending ? "Aguardando..." : "Entrar com Google"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}