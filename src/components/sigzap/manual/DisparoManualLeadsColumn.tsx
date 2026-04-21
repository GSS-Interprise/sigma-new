import { useState, useMemo } from "react";
import { useLeadsAContactar } from "@/hooks/useLeadsAContactar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type FiltroTipo = "todos" | "nao_contactados" | "contactados";

interface Props {
  campanhaPropostaId: string | null;
  selectedLeadId: string | null;
  onSelectLead: (id: string | null) => void;
}

export function DisparoManualLeadsColumn({ campanhaPropostaId, selectedLeadId, onSelectLead }: Props) {
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");
  const { data: leads, isLoading } = useLeadsAContactar(campanhaPropostaId);

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

  return (
    <div className="border-r flex flex-col h-full bg-card">
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
            { key: "nao_contactados", label: "Não contactados" },
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

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {!campanhaPropostaId && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              Selecione uma campanha e uma proposta no topo.
            </p>
          )}
          {campanhaPropostaId && isLoading && (
            <>
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </>
          )}
          {campanhaPropostaId && !isLoading && filtrados.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              Nenhum lead nesta categoria.
            </p>
          )}
          {filtrados.map((l) => (
            <button
              key={l.lead_id}
              onClick={() => onSelectLead(l.lead_id)}
              className={cn(
                "w-full text-left p-2 rounded-md border transition-colors hover:bg-muted/60",
                selectedLeadId === l.lead_id ? "bg-muted border-primary" : "border-transparent"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sm truncate">{l.nome || "(sem nome)"}</div>
                {l.contactado && (
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
        </div>
      </ScrollArea>
    </div>
  );
}