import { useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/dateUtils";
import { textoPlano } from "@/lib/textoPlano";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSetor } from "@/hooks/useUserSetor";
import {
  useAtualizarStatusDemanda,
  useDemandasMinhasEnviadas,
  useDemandasParaMim,
  type DemandaTarefa,
} from "@/hooks/useDemandas";

const VISIVEIS = 8;

function dataDa(t: DemandaTarefa): Date | null {
  if (!t.data_limite) return null;
  return parseLocalDate(t.data_limite) ?? new Date(t.data_limite);
}

/** Quando vence, em palavras, e se está atrasada (âmbar = espera você, como no resto do redesenho). */
function prazo(t: DemandaTarefa): { texto: string; atrasada: boolean } {
  const d = dataDa(t);
  if (!d) return { texto: "Sem prazo", atrasada: false };
  const dias = differenceInCalendarDays(d, new Date());
  const hora = t.data_limite_hora ? ` às ${t.data_limite_hora.slice(0, 5)}` : "";
  if (dias < 0) return { texto: dias === -1 ? "Atrasada desde ontem" : `Atrasada há ${-dias} dias`, atrasada: true };
  if (dias === 0) return { texto: `Hoje${hora}`, atrasada: false };
  if (dias === 1) return { texto: `Amanhã${hora}`, atrasada: false };
  const dia = format(d, "EEEE, dd/MM", { locale: ptBR }).replace("-feira", "");
  return { texto: dia.charAt(0).toUpperCase() + dia.slice(1) + hora, atrasada: false };
}

/**
 * As tarefas abertas da pessoa (as que ela criou e as que são dela ou em que foi mencionada), numa lista só:
 * atrasadas primeiro, depois hoje e os próximos dias; sem prazo no fim.
 * Recorrentes: só a próxima ocorrência (mesma regra de ColunaMinhasTarefas), senão a lista enche de cópias.
 */
function ordenarAbertas(tarefas: DemandaTarefa[]): DemandaTarefa[] {
  const abertas = tarefas.filter((t) => t.status !== "concluida");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const soltas = abertas.filter((t) => !t.recorrencia_id);
  const porSerie = new Map<string, DemandaTarefa[]>();
  abertas
    .filter((t) => t.recorrencia_id)
    .forEach((t) => porSerie.set(t.recorrencia_id!, [...(porSerie.get(t.recorrencia_id!) ?? []), t]));
  porSerie.forEach((serie) => {
    const ord = [...serie].sort((a, b) => (a.data_limite ?? "").localeCompare(b.data_limite ?? ""));
    const proxima = ord.find((t) => (dataDa(t) ?? hoje) >= hoje);
    const atrasada = [...ord].reverse().find((t) => (dataDa(t) ?? hoje) < hoje);
    const escolhida = atrasada ?? proxima;
    if (escolhida) soltas.push(escolhida);
  });
  return soltas.sort((a, b) => {
    if (a.data_limite && b.data_limite) return a.data_limite.localeCompare(b.data_limite);
    if (a.data_limite) return -1;
    if (b.data_limite) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function HojeParaVoce({
  onAbrir,
  onVerTodas,
}: {
  onAbrir: (id: string) => void;
  onVerTodas: () => void;
}) {
  const { user } = useAuth();
  const { setorId } = useUserSetor();
  const { data: enviadas = [], isLoading: l1, isError: e1 } = useDemandasMinhasEnviadas();
  const { data: paraMim = [], isLoading: l2, isError: e2 } = useDemandasParaMim();
  const status = useAtualizarStatusDemanda();
  const [concluindo, setConcluindo] = useState<string | null>(null);

  const abertas = useMemo(() => {
    const m = new Map<string, DemandaTarefa>();
    [...enviadas, ...paraMim].forEach((t) => m.set(t.id, t));
    return ordenarAbertas(Array.from(m.values()));
  }, [enviadas, paraMim]);

  const atrasadas = abertas.filter((t) => prazo(t).atrasada).length;
  const visiveis = abertas.slice(0, VISIVEIS);

  const concluir = (t: DemandaTarefa) => {
    setConcluindo(t.id);
    status.mutate(
      { id: t.id, status: "concluida" },
      {
        onSuccess: () =>
          toast.success("Tarefa concluída.", {
            action: { label: "Desfazer", onClick: () => status.mutate({ id: t.id, status: "aberta" }) },
          }),
        onSettled: () => setConcluindo(null),
      },
    );
  };

  return (
    <section className="flex min-h-0 flex-col rounded-xl border bg-card">
      <header className="flex items-baseline gap-2 px-5 pb-2 pt-4">
        <h2 className="font-display text-base font-semibold">Hoje para você</h2>
        {!l1 && !l2 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {abertas.length}
            {atrasadas > 0 && <span className="text-amber-700"> · {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span>}
          </span>
        )}
      </header>

      {(l1 || l2) && (
        <div className="space-y-3 px-5 pb-5 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {(e1 || e2) && !l1 && !l2 && (
        <p className="px-5 pb-5 text-sm text-destructive">
          Não deu para carregar suas tarefas. Recarregue a página; se continuar, avise o suporte.
        </p>
      )}

      {!l1 && !l2 && !e1 && !e2 && abertas.length === 0 && (
        <p className="px-5 pb-6 pt-2 text-sm text-muted-foreground">
          Nada esperando você. Uma tarefa nova entra aqui pelo botão Nova demanda.
        </p>
      )}

      {visiveis.length > 0 && (
        <ul className="min-h-0 flex-1 divide-y overflow-auto">
          {visiveis.map((t) => {
            const p = prazo(t);
            const titulo = textoPlano(t.titulo) || "Tarefa sem título";
            const outro =
              t.created_by === user?.id
                ? t.responsavel_nome && t.responsavel_id !== user?.id
                  ? `Para ${t.responsavel_nome}`
                  : t.setor_destino_nome && t.setor_destino_id !== setorId
                    ? `Para ${t.setor_destino_nome}`
                    : null
                : t.criador_nome
                  ? `De ${t.criador_nome}`
                  : null;
            return (
              <li key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/40">
                <span
                  className={cn(
                    "w-[150px] shrink-0 text-xs font-medium tabular-nums",
                    p.atrasada ? "text-amber-700" : "text-muted-foreground",
                  )}
                >
                  {p.texto}
                </span>
                <button
                  type="button"
                  onClick={() => onAbrir(t.id)}
                  className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate text-sm font-semibold" title={titulo}>
                    {titulo}
                  </span>
                  {outro && <span className="block truncate text-xs text-muted-foreground">{outro}</span>}
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  disabled={concluindo === t.id}
                  onClick={() => concluir(t)}
                >
                  {concluindo === t.id ? "Concluindo…" : "Concluir"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {abertas.length > VISIVEIS && (
        <button
          type="button"
          onClick={onVerTodas}
          className="border-t px-5 py-3 text-left text-sm font-medium text-primary hover:underline"
        >
          Ver as {abertas.length} no Kanban
        </button>
      )}
    </section>
  );
}
