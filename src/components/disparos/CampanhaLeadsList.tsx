import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Search, User, Phone, MapPin, Loader2 } from "lucide-react";
import { LeadProntuarioDialog } from "@/components/medicos/LeadProntuarioDialog";

type FiltroStatus = "todos" | "contactar" | "contactado" | "aberto" | "fechado";

interface Props {
  listaId: string | null | undefined;
  /** Cor do canal (para acento visual) */
  accentClass?: string;
}

// Mapeamento de status do lead para os 4 buckets do filtro
const STATUS_FECHADOS = ["Convertido", "Descartado", "Desinteresse", "Bloqueado", "Perdido"];
const STATUS_CONTACTADOS = ["Em conversa", "Em negociação", "Proposta enviada", "Follow-up"];
const STATUS_ABERTOS = ["Aberto", "Em conversa", "Em negociação", "Proposta enviada", "Follow-up", "Novo"];
const STATUS_CONTACTAR = ["Novo", "Sem contato", "A contactar", "Pendente"];

function bucketize(status: string | null | undefined): FiltroStatus[] {
  const s = status || "Novo";
  const buckets: FiltroStatus[] = [];
  if (STATUS_FECHADOS.includes(s)) buckets.push("fechado");
  else {
    if (STATUS_ABERTOS.includes(s)) buckets.push("aberto");
    if (STATUS_CONTACTADOS.includes(s)) buckets.push("contactado");
    if (STATUS_CONTACTAR.includes(s)) buckets.push("contactar");
  }
  return buckets;
}

const FILTROS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "contactar", label: "A contactar" },
  { value: "contactado", label: "Contactados" },
  { value: "aberto", label: "Em aberto" },
  { value: "fechado", label: "Fechados" },
];

export function CampanhaLeadsList({ listaId }: Props) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");
  const [leadAberto, setLeadAberto] = useState<string | null>(null);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ["campanha-lista-leads", listaId],
    enabled: !!listaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disparo_lista_itens")
        .select(
          "id, lead_id, leads:lead_id (id, nome, phone_e164, especialidade, uf, cidade, status)"
        )
        .eq("lista_id", listaId!);
      if (error) throw error;
      return (data || [])
        .map((i: any) => i.leads)
        .filter(Boolean);
    },
  });

  const counts = useMemo(() => {
    const c: Record<FiltroStatus, number> = {
      todos: itens.length,
      contactar: 0,
      contactado: 0,
      aberto: 0,
      fechado: 0,
    };
    for (const l of itens) {
      for (const b of bucketize(l.status)) c[b]++;
    }
    return c;
  }, [itens]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((l: any) => {
      if (filtro !== "todos" && !bucketize(l.status).includes(filtro)) return false;
      if (q) {
        const hay = `${l.nome ?? ""} ${l.phone_e164 ?? ""} ${l.especialidade ?? ""} ${l.cidade ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [itens, filtro, busca]);

  if (!listaId) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Esta proposta ainda não tem uma lista vinculada.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lead..."
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTROS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filtro === f.value ? "default" : "outline"}
              onClick={() => setFiltro(f.value)}
              className="h-8"
            >
              {f.label}
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                {counts[f.value]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Nenhum lead encontrado neste filtro.
        </Card>
      ) : (
        <ScrollArea className="h-[420px] pr-3">
          <div className="grid gap-2">
            {filtrados.map((l: any) => (
              <Card
                key={l.id}
                onClick={() => setLeadAberto(l.id)}
                className="p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{l.nome || "Sem nome"}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        {l.phone_e164 && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {l.phone_e164}
                          </span>
                        )}
                        {(l.cidade || l.uf) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[l.cidade, l.uf].filter(Boolean).join(" / ")}
                          </span>
                        )}
                        {l.especialidade && <span>{l.especialidade}</span>}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {l.status || "Novo"}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <LeadProntuarioDialog
        leadId={leadAberto}
        open={!!leadAberto}
        onOpenChange={(o) => !o && setLeadAberto(null)}
      />
    </div>
  );
}
