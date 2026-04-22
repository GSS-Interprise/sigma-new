import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVincularProposta } from "@/hooks/useCampanhaPropostas";
import { FileText } from "lucide-react";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function VincularPropostaCampanhaDialog({ campanhaId, open, onOpenChange }: Props) {
  const [propostaId, setPropostaId] = useState("");

  const { data: propostas = [] } = useQuery({
    queryKey: ["propostas-todas-vinculo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proposta")
        .select("id, id_proposta, descricao, status")
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []).filter(
        (p: any) => p.status === "geral" && !/personalizada/i.test(p.descricao || "")
      );
    },
  });

  const vincular = useVincularProposta();

  const handleSubmit = async () => {
    if (!propostaId) return;
    await vincular.mutateAsync({
      campanha_id: campanhaId,
      proposta_id: propostaId,
      lista_id: null,
    });
    setPropostaId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Vincular proposta à campanha
          </DialogTitle>
          <DialogDescription>
            Selecione a proposta geral que será associada a esta campanha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Proposta *</Label>
            <Select value={propostaId} onValueChange={setPropostaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma proposta" />
              </SelectTrigger>
              <SelectContent>
                {propostas.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.id_proposta || p.descricao || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!propostaId || vincular.isPending}
            className="w-full"
          >
            {vincular.isPending ? "Vinculando..." : "Vincular proposta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
