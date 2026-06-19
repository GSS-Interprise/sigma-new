import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
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

function labelGrupo(dataISO: string | null): string {
  if (!dataISO) return "Sem data";
  const d = parseLocalDate(dataISO) ?? new Date(dataISO);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (isToday(d)) return `Hoje • ${format(d, "dd 'de' MMM", { locale: ptBR })}`;
  if (isTomorrow(d)) return `Amanhã • ${format(d, "dd 'de' MMM", { locale: ptBR })}`;
  if (d < hoje) return `Atrasada • ${format(d, "dd 'de' MMM", { locale: ptBR })}`;
  return format(d, "EEE, dd 'de' MMM", { locale: ptBR });
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

  const abertasRaw = tarefas.filter((t) => t.status !== "concluida");
  const concluidas = tarefas.filter((t) => t.status === "concluida");

  // Dedup recorrentes: apenas a próxima ocorrência da semana atual (até domingo)
  const abertas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fimSemana = new Date(hoje);
    const diasParaDomingo = 7 - hoje.getDay(); // 0=dom -> 7; mantém semana corrente
    fimSemana.setDate(hoje.getDate() + diasParaDomingo);
    fimSemana.setHours(23, 59, 59, 999);

    const naoRecorrentes = abertasRaw.filter((t) => !t.recorrencia_id);
    const recorrentesPorId = new Map<string, DemandaTarefa[]>();
    abertasRaw
      .filter((t) => !!t.recorrencia_id)
      .forEach((t) => {
        const arr = recorrentesPorId.get(t.recorrencia_id!) ?? [];
        arr.push(t);
        recorrentesPorId.set(t.recorrencia_id!, arr);
      });

    const recorrentesDedup: DemandaTarefa[] = [];
    recorrentesPorId.forEach((arr) => {
      // ordena por data_limite asc; pega a primeira dentro da janela [hoje, fimSemana]
      const sorted = [...arr].sort((a, b) =>
        (a.data_limite ?? "").localeCompare(b.data_limite ?? ""),
      );
      const naSemana = sorted.find((t) => {
        if (!t.data_limite) return false;
        const d = parseLocalDate(t.data_limite) ?? new Date(t.data_limite);
        return d >= hoje && d <= fimSemana;
      });
      // se não houver na semana mas houver atrasada, mostra a mais recente atrasada
      const atrasada = !naSemana
        ? sorted.find((t) => {
            if (!t.data_limite) return false;
            const d = parseLocalDate(t.data_limite) ?? new Date(t.data_limite);
            return d < hoje;
          })
        : null;
      const escolhida = naSemana ?? atrasada;
      if (escolhida) recorrentesDedup.push(escolhida);
    });

    const todas = [...naoRecorrentes, ...recorrentesDedup];
    todas.sort((a, b) => {
      if (a.data_limite && b.data_limite)
        return a.data_limite.localeCompare(b.data_limite);
      if (a.data_limite) return -1;
      if (b.data_limite) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
    return todas;
  }, [abertasRaw]);

  // Agrupar por data_limite para renderizar headers de dia
  const grupos = useMemo(() => {
    const m = new Map<string, DemandaTarefa[]>();
    abertas.forEach((t) => {
      const key = t.data_limite ?? "__sem__";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    });
    const entries = Array.from(m.entries());
    entries.sort(([a], [b]) => {
      if (a === "__sem__") return 1;
      if (b === "__sem__") return -1;
      return a.localeCompare(b);
    });
    return entries;
  }, [abertas]);

  return (
    <Card className="flex flex-col h-full rounded-2xl border-border/70 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2 bg-card sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <ListTodo className="h-4 w-4 text-primary" />
          </div>
          <h3 className="font-bold text-base tracking-tight">Minhas tarefas</h3>
          <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {abertas.length} aberta{abertas.length === 1 ? "" : "s"}
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
            className="h-7 gap-1 px-3 text-xs rounded-lg shadow-sm shadow-primary/20"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 px-3 py-3 bg-muted/30">
        <div className="space-y-3">
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
          {grupos.map(([key, items]) => {
            const isAtrasado =
              key !== "__sem__" &&
              (() => {
                const d = parseLocalDate(key) ?? new Date(key);
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                return d < hoje;
              })();
            return (
              <div key={key} className="space-y-2">
                <div
                  className={cn(
                    "sticky top-0 z-[1] -mx-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded",
                    isAtrasado
                      ? "text-red-600 bg-red-50/80 dark:bg-red-950/30"
                      : "text-muted-foreground bg-muted/60 backdrop-blur",
                  )}
                >
                  {labelGrupo(key === "__sem__" ? null : key)}
                  <span className="ml-2 opacity-60 font-normal normal-case tracking-normal">
                    {items.length} tarefa{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                {items.map((t) => (
                  <TarefaCard
                    key={t.id}
                    tarefa={t}
                    onConcluir={(id) => concluir.mutate({ id, status: "concluida" })}
                    onReabrir={(id) => concluir.mutate({ id, status: "aberta" })}
                    onClick={() => onTarefaClick?.(t.id)}
                  />
                ))}
              </div>
            );
          })}
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