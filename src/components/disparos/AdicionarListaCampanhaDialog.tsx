import { useState, useMemo } from "react";
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
import { useVincularListaProposta } from "@/hooks/useCampanhaListas";
import { useCampanhaPropostas } from "@/hooks/useCampanhaPropostas";
import { Users } from "lucide-react";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AdicionarListaCampanhaDialog({ campanhaId, open, onOpenChange }: Props) {
  const [propostaId, setPropostaId] = useState("");
  const [listaId, setListaId] = useState("");
  const { data: listas = [] } = useDisparoListas();
  const { data: vinculos = [] } = useCampanhaPropostas(campanhaId);
  const vincular = useVincularListaProposta();

  const propostasAtivas = useMemo(
    () => (vinculos as any[]).filter((v) => v.status === "ativa"),
    [vinculos]
  );

  const handleSubmit = async () => {
    if (!propostaId || !listaId) return;
    await vincular.mutateAsync({
      campanha_proposta_id: propostaId,
      lista_id: listaId,
      campanha_id: campanhaId,
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
            <Users className="h-5 w-5" />
            Vincular lista a uma proposta
          </DialogTitle>
          <DialogDescription>
            Escolha a proposta vinculada à campanha e a lista de contatos que será usada nela.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Proposta da campanha *</Label>
            <Select value={propostaId} onValueChange={setPropostaId}>
              <SelectTrigger>
                <SelectValue placeholder={propostasAtivas.length ? "Selecione a proposta" : "Nenhuma proposta vinculada"} />
              </SelectTrigger>
              <SelectContent>
                {propostasAtivas.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.proposta?.id_proposta || v.proposta?.descricao || v.id.slice(0, 8)}
                    {v.lista?.nome ? ` • atual: ${v.lista.nome}` : ""}
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
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!propostaId || !listaId || vincular.isPending}
            className="w-full"
          >
            {vincular.isPending ? "Vinculando..." : "Vincular lista"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
