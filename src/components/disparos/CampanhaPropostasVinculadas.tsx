import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Plus, ExternalLink } from "lucide-react";
import { useCampanhaPropostas } from "@/hooks/useCampanhaPropostas";
import { VincularPropostaCampanhaDialog } from "./VincularPropostaCampanhaDialog";
import { CampanhaPropostaModal } from "./CampanhaPropostaModal";

interface Props {
  campanhaId: string;
}

export function CampanhaPropostasVinculadas({ campanhaId }: Props) {
  const qc = useQueryClient();
  const { data: vinculos = [], isLoading } = useCampanhaPropostas(campanhaId);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [cpAberto, setCpAberto] = useState<string | null>(null);

  useEffect(() => {
    if (!campanhaId) return;
    const channel = supabase
      .channel(`cp-${campanhaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campanha_propostas", filter: `campanha_id=eq.${campanhaId}` },
        () => qc.invalidateQueries({ queryKey: ["campanha-propostas", campanhaId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [campanhaId, qc]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Propostas vinculadas ({vinculos.length})
        </h4>
        <Button size="sm" variant="outline" onClick={() => setVincularOpen(true)}>
          <Plus className="h-3 w-3 mr-1" />
          Vincular proposta
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : vinculos.length === 0 ? (
        <Card className="p-3 text-center text-xs text-muted-foreground">
          Nenhuma proposta vinculada. Vincule para ativar os 7 canais multi-segmento.
        </Card>
      ) : (
        <div className="grid gap-2">
          {vinculos.map((v: any) => (
            <Card
              key={v.id}
              className="p-3 hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => setCpAberto(v.id)}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {v.proposta?.id_proposta || v.proposta?.descricao || "Proposta"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Lista: {v.lista?.nome || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.status === "encerrada" ? "destructive" : "default"}>
                    {v.status}
                  </Badge>
                  {v.webhook_trafego_enviado_at && (
                    <Badge variant="secondary" className="text-[10px]">
                      tráfego ✓
                    </Badge>
                  )}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <VincularPropostaCampanhaDialog
        campanhaId={campanhaId}
        open={vincularOpen}
        onOpenChange={setVincularOpen}
      />
      <CampanhaPropostaModal
        campanhaPropostaId={cpAberto}
        open={!!cpAberto}
        onOpenChange={(o) => !o && setCpAberto(null)}
      />
    </div>
  );
}
