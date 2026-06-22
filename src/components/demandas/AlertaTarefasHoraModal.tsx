import { useNavigate, useLocation } from "react-router-dom";
import { AlarmClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTarefasHoraAlerta } from "@/hooks/useTarefasHoraAlerta";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Modal global incômodo para tarefas com horário definido próximo (0–15 min).
 * Mesmo estilo do AlertaDemandasAtrasadasModal, porém em âmbar/amarelo.
 */
export function AlertaTarefasHoraModal() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { pendentes, dispensar } = useTarefasHoraAlerta();

  const isPublicRoute = location.pathname === "/auth" || location.pathname === "/reset-password";
  if (!user || isPublicRoute) return null;
  if (!pendentes.length) return null;

  const abrirTarefa = (id: string) => {
    dispensar(id);
    navigate(`/demandas?tarefa=${id}`);
  };

  const dispensarTodas = () => {
    pendentes.forEach((p) => dispensar(p.id));
  };

  const total = pendentes.length;

  return (
    <>
      <div className="fixed inset-0 z-[2147483644] bg-black/70 backdrop-blur-sm animate-in fade-in pointer-events-auto" />
      <div
        className="demanda-modal-shake fixed left-1/2 top-1/2 z-[2147483645] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-amber-500 bg-black text-white shadow-[0_0_60px_rgba(245,158,11,0.7)] pointer-events-auto"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="demanda-atrasada-gritante flex items-center gap-3 rounded-t-md p-4 border-b-2 border-amber-600 bg-amber-600/20">
          <AlarmClock className="h-6 w-6 shrink-0 text-amber-300" />
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide">
              {total} Tarefa{total > 1 ? "s" : ""} chegando
            </h2>
            <p className="text-xs opacity-90">Horário definido nos próximos 15 minutos</p>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2 bg-zinc-950">
          {pendentes
            .slice()
            .sort((a, b) => a.diff - b.diff)
            .map((t) => (
              <button
                key={t.id}
                onClick={() => abrirTarefa(t.id)}
                className={cn(
                  "w-full text-left flex items-center justify-between gap-3 rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 transition",
                  "hover:bg-amber-900/60 hover:border-amber-400 group",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white line-clamp-1">{t.titulo}</p>
                  <p className="text-[11px] text-amber-300 mt-0.5">
                    {t.diff === 0 ? (
                      <span className="font-bold">Agora ({t.data_limite_hora.slice(0, 5)})</span>
                    ) : (
                      <>
                        Em <span className="font-bold">{t.diff} min</span> · {t.data_limite_hora.slice(0, 5)}
                      </>
                    )}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-300 group-hover:text-white shrink-0 transition" />
              </button>
            ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-amber-900/60 bg-black p-3">
          <p className="text-[11px] text-zinc-400">
            Clique numa tarefa para abrir ou dispense para ocultar até o próximo minuto.
          </p>
          <Button
            size="sm"
            onClick={dispensarTodas}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
          >
            Dispensar
          </Button>
        </div>
      </div>
    </>
  );
}