import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemandasAtrasadas } from "@/hooks/useDemandasAtrasadas";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 40 * 60 * 1000; // 40 minutos
const SNOOZE_KEY = "demandas-atrasadas-modal:last-shown";

/**
 * Modal global incômodo: abre automaticamente ao logar (se houver atrasadas)
 * e a cada 40 minutos depois. Mostra lista clicável das demandas que passaram
 * do prazo, levando direto para /demandas. Lembrete: o "fechar" reseta o
 * relógio dos 40 min, mas o card no kanban continua piscando.
 */
export function AlertaDemandasAtrasadasModal() {
  const { data: atrasadas = [] } = useDemandasAtrasadas();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (!atrasadas.length) {
      setOpen(false);
      return;
    }
    const last = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Date.now() - last >= INTERVAL_MS) {
      setOpen(true);
      setShakeKey((k) => k + 1);
    }
    const id = window.setInterval(() => {
      if (atrasadas.length) {
        setOpen(true);
        setShakeKey((k) => k + 1);
      }
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [atrasadas.length]);

  const fechar = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
  };

  const abrirTarefa = (id: string) => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
    navigate(`/demandas?tarefa=${id}`);
  };

  if (!open || !atrasadas.length) return null;

  return (
    <>
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm animate-in fade-in"
        onClick={fechar}
      />
      {/* Modal */}
      <div
        key={shakeKey}
        className="demanda-modal-shake fixed left-1/2 top-1/2 z-[101] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-red-600 bg-black text-white shadow-[0_0_60px_rgba(220,38,38,0.7)]"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Header piscando */}
        <div className="demanda-atrasada-gritante flex items-center justify-between gap-3 rounded-t-md p-4 border-b-2 border-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <div>
              <h2 className="text-lg font-bold uppercase tracking-wide">
                {atrasadas.length} Demanda{atrasadas.length > 1 ? "s" : ""} Atrasada{atrasadas.length > 1 ? "s" : ""}
              </h2>
              <p className="text-xs opacity-90">Resolva agora para sair do vermelho.</p>
            </div>
          </div>
          <button
            onClick={fechar}
            className="rounded p-1 hover:bg-white/20 transition"
            aria-label="Fechar"
            data-overdue-keep
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lista */}
        <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2 bg-zinc-950">
          {atrasadas
            .slice()
            .sort((a, b) => a.data_limite.localeCompare(b.data_limite))
            .map((t) => {
              const data = parseLocalDate(t.data_limite) ?? new Date(t.data_limite);
              const diasAtraso = Math.abs(differenceInCalendarDays(data, new Date()));
              return (
                <button
                  key={t.id}
                  onClick={() => abrirTarefa(t.id)}
                  className={cn(
                    "w-full text-left flex items-center justify-between gap-3 rounded-lg border border-red-800/60 bg-red-950/40 p-3 transition",
                    "hover:bg-red-900/60 hover:border-red-500 group",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white line-clamp-1">{t.titulo}</p>
                    <p className="text-[11px] text-red-300 mt-0.5">
                      Venceu em {format(data, "dd MMM yyyy", { locale: ptBR })} ·{" "}
                      <span className="font-bold">
                        {diasAtraso} dia{diasAtraso === 1 ? "" : "s"} de atraso
                      </span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-red-300 group-hover:text-white shrink-0 transition" />
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-red-900/60 bg-black p-3">
          <p className="text-[11px] text-zinc-400">
            Próximo lembrete em 40 minutos
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fechar}
              className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Lembrar depois
            </Button>
            <Button
              size="sm"
              onClick={() => {
                localStorage.setItem(SNOOZE_KEY, String(Date.now()));
                setOpen(false);
                navigate("/demandas");
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              Ir para Demandas
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}