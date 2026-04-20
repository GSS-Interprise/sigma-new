import { useState, useMemo } from "react";
import { useLeadsAContactar } from "@/hooks/useLeadsAContactar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  campanhaPropostaId: string | null;
  selectedLeadId: string | null;
  onSelectLead: (id: string | null) => void;
}

export function DisparoManualLeadsColumn({ campanhaPropostaId, selectedLeadId, onSelectLead }: Props) {
  const [busca, setBusca] = useState("");
  const { data: leads, isLoading } = useLeadsAContactar(campanhaPropostaId);

  const filtrados = useMemo(() => {
    if (!leads) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (l.nome || "").toLowerCase().includes(q));
  }, [leads, busca]);

  return (
    <div className="border-r flex flex-col h-full bg-card">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Leads a contactar
          </h3>
          <span className="text-xs text-muted-foreground">{filtrados.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-7 h-8 text-sm"
          />
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
              Nenhum lead "a contactar" nesta proposta.
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
              <div className="font-medium text-sm truncate">{l.nome || "(sem nome)"}</div>
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