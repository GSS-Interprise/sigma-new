import { useMemo, useState } from "react";
import { addDays, format, isSameDay, isToday, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateUtils";
import { textoPlano } from "@/lib/textoPlano";
import { useDemandasDoSetor } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { useGoogleCalendarEvents, useGoogleConnection } from "@/hooks/useGoogleCalendar";
import { ColunaAgenda } from "@/components/demandas/ColunaAgenda";

type Evento = { id: string; hora: string | null; titulo: string; tarefaId?: string };

/**
 * A semana útil (segunda a sexta) numa faixa: o que tem em cada dia, da agenda do setor e do Google, se
 * a pessoa conectou. O calendário do mês inteiro, com criar evento e conectar o Google, abre em "Ver o mês"
 * (é o ColunaAgenda de antes, sem mudança).
 */
export function SuaSemana({ onAbrirTarefa }: { onAbrirTarefa: (id: string) => void }) {
  const { setorId } = useUserSetor();
  const [mesAberto, setMesAberto] = useState(false);
  const { inicio, fim, dias } = useMemo(() => {
    const ini = startOfWeek(new Date(), { weekStartsOn: 1 });
    const ds = [0, 1, 2, 3, 4].map((i) => addDays(ini, i));
    const f = addDays(ini, 4);
    f.setHours(23, 59, 59, 999);
    return { inicio: ini, fim: f, dias: ds };
  }, []);

  const { data: tarefas = [], isLoading } = useDemandasDoSetor(setorId, inicio, fim);
  const { data: gConn } = useGoogleConnection();
  const google = !!gConn?.connected;
  const { data: gEventos = [] } = useGoogleCalendarEvents(google, inicio, fim);

  const porDia = useMemo(
    () =>
      dias.map((dia) => {
        const evs: Evento[] = [];
        tarefas.forEach((t) => {
          const d = t.data_limite ? parseLocalDate(t.data_limite) : null;
          if (d && isSameDay(d, dia))
            evs.push({
              id: t.id,
              hora: t.data_limite_hora?.slice(0, 5) ?? null,
              titulo: textoPlano(t.titulo) || "Tarefa",
              tarefaId: t.id,
            });
        });
        gEventos.forEach((g) => {
          const ini = g.start?.dateTime ? parseISO(g.start.dateTime) : g.start?.date ? parseLocalDate(g.start.date) : null;
          if (ini && isSameDay(ini, dia))
            evs.push({
              id: `g-${g.id}`,
              hora: g.start?.dateTime ? format(ini, "HH:mm") : null,
              titulo: g.summary || "Evento",
            });
        });
        evs.sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99"));
        return { dia, evs };
      }),
    [dias, tarefas, gEventos],
  );

  return (
    <section className="rounded-xl border bg-card px-5 py-4">
      <header className="mb-2 flex items-baseline gap-2">
        <h2 className="shrink-0 font-display text-base font-semibold">Sua semana</h2>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{google ? "Agenda do setor e Google" : "Agenda do setor"}</span>
        <button
          type="button"
          onClick={() => setMesAberto(true)}
          className="ml-auto shrink-0 whitespace-nowrap text-sm font-medium text-primary hover:underline"
        >
          Ver o mês
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <ol className="divide-y">
          {porDia.map(({ dia, evs }) => {
            const hoje = isToday(dia);
            return (
              <li key={dia.toISOString()} className="flex gap-3 py-2">
                <div className={cn("w-11 shrink-0 text-center", hoje ? "text-primary" : "text-muted-foreground")}>
                  <b className={cn("block text-base tabular-nums leading-5", hoje ? "text-primary" : "text-foreground")}>
                    {format(dia, "dd")}
                  </b>
                  <span className="text-xs capitalize">{hoje ? "Hoje" : format(dia, "EEE", { locale: ptBR }).replace(".", "")}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  {evs.length === 0 && <span className="text-sm text-muted-foreground">Livre</span>}
                  {evs.slice(0, 3).map((e) =>
                    e.tarefaId ? (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onAbrirTarefa(e.tarefaId!)}
                        className="truncate text-left text-sm hover:underline"
                        title={e.titulo}
                      >
                        {e.hora && <span className="mr-1.5 tabular-nums text-muted-foreground">{e.hora}</span>}
                        {e.titulo}
                      </button>
                    ) : (
                      <span key={e.id} className="truncate text-sm" title={e.titulo}>
                        {e.hora && <span className="mr-1.5 tabular-nums text-muted-foreground">{e.hora}</span>}
                        {e.titulo}
                      </span>
                    ),
                  )}
                  {evs.length > 3 && <span className="text-xs text-muted-foreground">e mais {evs.length - 3}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={mesAberto} onOpenChange={setMesAberto}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Agenda do mês</DialogTitle>
            <DialogDescription>Clique num dia para ver ou criar um evento.</DialogDescription>
          </DialogHeader>
          <div className="h-[70vh] min-h-0">
            <ColunaAgenda onTarefaClick={(id) => { setMesAberto(false); onAbrirTarefa(id); }} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
