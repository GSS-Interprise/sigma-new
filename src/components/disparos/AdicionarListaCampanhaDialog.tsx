import { useState } from "react";
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
import { useAdicionarListaCampanha } from "@/hooks/useCampanhaListas";
import { Users } from "lucide-react";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AdicionarListaCampanhaDialog({ campanhaId, open, onOpenChange }: Props) {
  const [listaId, setListaId] = useState("");
  const { data: listas = [] } = useDisparoListas();
  const adicionar = useAdicionarListaCampanha();

  const handleSubmit = async () => {
    if (!listaId) return;
    await adicionar.mutateAsync({ campanha_id: campanhaId, lista_id: listaId });
    setListaId("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Adicionar lista de disparo
          </DialogTitle>
          <DialogDescription>
            Selecione a lista de contatos que ficará disponível nesta campanha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!listaId || adicionar.isPending}
            className="w-full"
          >
            {adicionar.isPending ? "Adicionando..." : "Adicionar lista"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
