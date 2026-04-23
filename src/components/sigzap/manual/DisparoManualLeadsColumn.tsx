import { useState, useMemo, useEffect, useRef } from "react";
import { useLeadsAContactar } from "@/hooks/useLeadsAContactar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, CheckCheck, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type FiltroTipo = "todos" | "nao_contactados" | "contactados";

const PAGE_SIZE = 30;

interface Props {
  campanhaPropostaId: string | null;
  selectedLeadId: string | null;
  onSelectLead: (id: string | null) => void;
}

export function DisparoManualLeadsColumn({ campanhaPropostaId, selectedLeadId, onSelectLead }: Props) {
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");
  const { data: leads, isLoading } = useLeadsAContactar(campanhaPropostaId);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => {
    const arr = leads || [];
    const contactados = arr.filter((l) => l.contactado).length;
    return {
      todos: arr.length,
      contactados,
      nao_contactados: arr.length - contactados,
    };
  }, [leads]);

  const filtrados = useMemo(() => {
    if (!leads) return [];
    if (filtro === "contactados") return leads.filter((l) => l.contactado);
    if (filtro === "nao_contactados") return leads.filter((l) => !l.contactado);
    return leads;
  }, [leads, filtro]);

  // Reset paginação ao trocar filtro/proposta
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filtro, campanhaPropostaId]);

  const visiveis = useMemo(() => filtrados.slice(0, visibleCount), [filtrados, visibleCount]);
  const temMais = visibleCount < filtrados.length;

  // IntersectionObserver para lazy load conforme scroll
  useEffect(() => {
    if (!temMais) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtrados.length));
        }
      },
      { root: null, rootMargin: "120px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [temMais, filtrados.length, visiveis.length]);

  return (
    <div className="border-r flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-card">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Leads
          </h3>
          <span className="text-xs text-muted-foreground">{filtrados.length}</span>
        </div>
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {([
            { key: "todos", label: "Todos" },
            { key: "nao_contactados", label: "Não lidos" },
            { key: "contactados", label: "Contactados" },
          ] as { key: FiltroTipo; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={cn(
                "shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors",
                filtro === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
              )}
            >
              {f.label}
              <span className="ml-1 opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {!campanhaPropostaId && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              Selecione uma campanha e uma proposta no topo.
            </p>
          )}
          {campanhaPropostaId && isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando leads...
              </div>
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          )}
          {campanhaPropostaId && !isLoading && filtrados.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              Nenhum lead nesta categoria.
            </p>
          )}
          {visiveis.map((l) => (
            <button
              key={l.lead_id}
              onClick={() => onSelectLead(l.lead_id)}
              className={cn(
                "w-full text-left p-2 rounded-md border transition-colors hover:bg-muted/60",
                selectedLeadId === l.lead_id ? "bg-muted border-primary" : "border-transparent",
                l.bloqueado_disparo_massa && "opacity-70 border-dashed border-amber-500/60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm truncate">{l.nome || "(sem nome)"}</div>
                {l.bloqueado_disparo_massa ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[10px] gap-0.5 border-amber-500 text-amber-600 dark:text-amber-400">
                          <Lock className="h-3 w-3" />
                          Em fila
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Em fila de disparo em massa ({l.status_disparo})
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : l.contactado && (
                  <Badge variant="secondary" className="shrink-0 h-5 px-1.5 text-[10px] gap-0.5">
                    <CheckCheck className="h-3 w-3" />
                    Contactado
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                {l.especialidade && <span className="truncate">{l.especialidade}</span>}
                {l.uf && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {l.uf}
                  </span>
                )}
              </div>
            </button>
          ))}
          {temMais && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando mais... ({visiveis.length}/{filtrados.length})
            </div>
          )}
          {!temMais && filtrados.length > PAGE_SIZE && (
            <div className="text-center text-[10px] text-muted-foreground py-2 opacity-60">
              {filtrados.length} leads carregados
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}