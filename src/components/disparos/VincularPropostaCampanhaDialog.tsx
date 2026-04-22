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
import { useDisparoListas } from "@/hooks/useDisparoListas";
import { useVincularProposta } from "@/hooks/useCampanhaPropostas";
import { Link2 } from "lucide-react";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function VincularPropostaCampanhaDialog({ campanhaId, open, onOpenChange }: Props) {
  const [propostaId, setPropostaId] = useState("");
  const [listaId, setListaId] = useState("");

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

  const { data: listas = [] } = useDisparoListas();
  const vincular = useVincularProposta();

  const handleSubmit = async () => {
    if (!propostaId || !listaId) return;
    await vincular.mutateAsync({
      campanha_id: campanhaId,
      proposta_id: propostaId,
      lista_id: listaId,
    });
    setPropostaId("");
    setListaId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular proposta à campanha
          </DialogTitle>
          <DialogDescription>
            Ao vincular, a lista é enviada automaticamente para o tráfego pago.
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
          <div className="space-y-2">
            <Label>Lista de prospecção *</Label>
            <Select value={listaId} onValueChange={setListaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a lista de contatos" />
              </SelectTrigger>
              <SelectContent>
                {listas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Os contatos da lista aparecerão dentro do dossiê da campanha.
            </p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!propostaId || !listaId || vincular.isPending}
            className="w-full"
          >
            {vincular.isPending ? "Vinculando..." : "Vincular e disparar tráfego pago"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
