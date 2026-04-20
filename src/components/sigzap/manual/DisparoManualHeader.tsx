import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send } from "lucide-react";

interface Props {
  campanhaId: string | null;
  propostaId: string | null;
  onChangeCampanha: (id: string | null) => void;
  onChangeProposta: (id: string | null) => void;
  onBack: () => void;
}

export function DisparoManualHeader({
  campanhaId, propostaId, onChangeCampanha, onChangeProposta, onBack,
}: Props) {
  const { data: campanhas } = useQuery({
    queryKey: ["dm-campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, status")
        .in("status", ["ativa", "ativo", "rascunho", "agendada"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: propostas } = useQuery({
    queryKey: ["dm-propostas", campanhaId],
    enabled: !!campanhaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanha_propostas")
        .select("id, status, proposta:proposta_id(id, id_proposta, descricao)")
        .eq("campanha_id", campanhaId!)
        .eq("status", "ativa")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="flex items-center justify-between w-full gap-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Send className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Disparo Manual</h1>
          <p className="text-xs text-muted-foreground">SIG Zap por proposta</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-2xl">
        <Select
          value={campanhaId ?? ""}
          onValueChange={(v) => {
            onChangeCampanha(v || null);
            onChangeProposta(null);
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione uma campanha" />
          </SelectTrigger>
          <SelectContent>
            {(campanhas || []).map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={propostaId ?? ""}
          onValueChange={(v) => onChangeProposta(v || null)}
          disabled={!campanhaId}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={campanhaId ? "Selecione a proposta" : "Escolha campanha primeiro"} />
          </SelectTrigger>
          <SelectContent>
            {(propostas || []).map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.proposta?.id_proposta ? `#${p.proposta.id_proposta} — ` : ""}
                {p.proposta?.descricao || "Proposta"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar ao Inbox
      </Button>
    </div>
  );
}