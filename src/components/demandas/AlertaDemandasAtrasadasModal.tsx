import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemandasAtrasadas } from "@/hooks/useDemandasAtrasadas";
import { usePendenciasSetor } from "@/hooks/useDemandas";
import { useUserSetor } from "@/hooks/useUserSetor";
import { usePermissions } from "@/hooks/usePermissions";
import { parseLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const INTERVAL_MS = 40 * 60 * 1000; // 40 minutos
const SNOOZE_KEY = "demandas-atrasadas-modal:last-shown";

/**
 * Modal global incômodo: abre automaticamente ao logar (se houver atrasadas)
 * e a cada 40 minutos depois. Mostra lista clicável das demandas que passaram
 * do prazo, levando direto para /demandas. Lembrete: o "fechar" reseta o
 * relógio dos 40 min, mas o card no kanban continua piscando.
 */
export function AlertaDemandasAtrasadasModal() {
  const { user } = useAuth();
  const location = useLocation();
  const { data: atrasadas = [] } = useDemandasAtrasadas();
  const { setorId } = useUserSetor();
  const { isAdmin } = usePermissions();
  const { data: pendenciasSetor = [] } = usePendenciasSetor(setorId, isAdmin);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  // Pendências do setor que já passaram da data de referência
  const pendenciasAtrasadas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return (pendenciasSetor as any[]).filter((p) => {
      if (!p.referencia_data) return false;
      const d = parseLocalDate(p.referencia_data) ?? new Date(p.referencia_data);
      return d.getTime() < hoje.getTime();
    });
  }, [pendenciasSetor]);

  const total = atrasadas.length + pendenciasAtrasadas.length;

  useEffect(() => {
    if (!user) {
      setOpen(false);
      return;
    }
    if (!total) {
      setOpen(false);
      return;
    }
    const last = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Date.now() - last >= INTERVAL_MS) {
      setOpen(true);
      setShakeKey((k) => k + 1);
    }
    const id = window.setInterval(() => {
      if (total) {
        setOpen(true);
        setShakeKey((k) => k + 1);
      }
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [total, user]);

  const confirmar = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
  };

  const abrirTarefa = (id: string) => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
    navigate(`/demandas?tarefa=${id}`);
  };

  const abrirLink = (link: string) => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setOpen(false);
    navigate(link);
  };

  // Não mostra em telas públicas (login / reset)
  const isPublicRoute = location.pathname === "/auth" || location.pathname === "/reset-password";
  if (!user || isPublicRoute) return null;
  if (!open || !total) return null;

  return (
    <>
      {/* Overlay escuro — sem fechar ao clicar fora (precisa confirmar) */}
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm animate-in fade-in" />
      {/* Modal */}
      <div
        key={shakeKey}
        className="demanda-modal-shake fixed left-1/2 top-1/2 z-[101] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-red-600 bg-black text-white shadow-[0_0_60px_rgba(220,38,38,0.7)]"
        role="alertdialog"
        aria-modal="true"
      >
        {/* Header piscando */}
        <div className="demanda-atrasada-gritante flex items-center gap-3 rounded-t-md p-4 border-b-2 border-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 shrink-0" />
            <div>
              <h2 className="text-lg font-bold uppercase tracking-wide">
                {total} Item{total > 1 ? "ns" : ""} Atrasado{total > 1 ? "s" : ""}
              </h2>
              <p className="text-xs opacity-90">
                {atrasadas.length} demanda{atrasadas.length === 1 ? "" : "s"} ·{" "}
                {pendenciasAtrasadas.length} pendência{pendenciasAtrasadas.length === 1 ? "" : "s"} do setor
              </p>
            </div>
          </div>
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
          {pendenciasAtrasadas
            .slice()
            .sort((a: any, b: any) =>
              String(a.referencia_data).localeCompare(String(b.referencia_data)),
            )
            .map((p: any) => {
              const data = parseLocalDate(p.referencia_data) ?? new Date(p.referencia_data);
              const diasAtraso = Math.abs(differenceInCalendarDays(data, new Date()));
              return (
                <button
                  key={`pend-${p.id}`}
                  onClick={() => abrirLink(p.link)}
                  className={cn(
                    "w-full text-left flex items-center justify-between gap-3 rounded-lg border border-orange-800/60 bg-orange-950/40 p-3 transition",
                    "hover:bg-orange-900/60 hover:border-orange-500 group",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-orange-300 shrink-0" />
                      <p className="text-sm font-semibold text-white line-clamp-1">{p.titulo}</p>
                    </div>
                    <p className="text-[11px] text-orange-300 mt-0.5">
                      Pendência do setor · venceu em{" "}
                      {format(data, "dd MMM yyyy", { locale: ptBR })} ·{" "}
                      <span className="font-bold">
                        {diasAtraso} dia{diasAtraso === 1 ? "" : "s"} de atraso
                      </span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-orange-300 group-hover:text-white shrink-0 transition" />
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-red-900/60 bg-black p-3">
          <p className="text-[11px] text-zinc-400">
            Você precisa confirmar ciência. Próximo lembrete em 40 min.
          </p>
          <Button
            size="sm"
            onClick={confirmar}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold"
          >
            Confirmar ciência
          </Button>
        </div>
      </div>
    </>
  );
}