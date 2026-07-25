import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: { id: string; nome: string; total_frio: number | null };
}

export function DuplicarCampanhaManualDialog({ open, onOpenChange, campanha }: Props) {
  const maxFrios = campanha.total_frio || 0;
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(Math.min(50, maxFrios));
  const [name, setName] = useState(`${campanha.nome} (cópia)`);
  const [region, setRegion] = useState("");
  const [sendType, setSendType] = useState("manual");
  const [status, setStatus] = useState("rascunho");
  const [copyStrategies, setCopyStrategies] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(`${campanha.nome} (cópia)`);
    setQuantity(Math.min(50, maxFrios));
    setRegion("");
    setSendType("manual");
    setStatus("rascunho");
    setCopyStrategies(true);
  }, [open, campanha.nome, maxFrios]);

  const effectiveQuantity = Math.min(maxFrios, Math.max(0, quantity));

  const duplicate = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da nova campanha.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc(
        "duplicate_campaign_context" as never,
        {
          p_campanha_origem: campanha.id,
          p_nome: name.trim(),
          p_tipo_envio: sendType,
          p_status: status,
          p_regiao_estado: region.trim() || null,
          p_qtd_leads: effectiveQuantity,
          p_copy_strategies: copyStrategies,
        } as never,
      );
      if (error) throw error;
      toast.success(`Campanha duplicada com ${effectiveQuantity} lead(s), sem alterar o histórico original.`);
      await queryClient.invalidateQueries({ queryKey: ["campanhas-prospeccao"] });
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(`Erro ao duplicar: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicar campanha
          </DialogTitle>
          <DialogDescription>
            A campanha e o histórico originais permanecem intactos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="duplicate-name">Nome da nova campanha</Label>
            <Input id="duplicate-name" className="min-h-11" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={sendType} onValueChange={setSendType}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="ia">IA</SelectItem>
                  <SelectItem value="ambos">Manual + IA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status inicial</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rascunho">Rascunho</SelectItem>
                  <SelectItem value="pausada">Pausada</SelectItem>
                  <SelectItem value="ativa">Ativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duplicate-region">Região da cópia</Label>
            <Input
              id="duplicate-region"
              className="min-h-11"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Em branco mantém a região original"
            />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3">
            <Checkbox checked={copyStrategies} onCheckedChange={(checked) => setCopyStrategies(checked === true)} />
            <span className="text-sm">Copiar estratégias, públicos, ordem regional e abordagens</span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="duplicate-quantity">Leads frios a copiar ({maxFrios} disponíveis)</Label>
            <Input
              id="duplicate-quantity"
              type="number"
              className="min-h-11"
              min={0}
              max={maxFrios}
              value={quantity}
              onChange={(event) => setQuantity(Math.min(maxFrios, Math.max(0, Number(event.target.value) || 0)))}
              disabled={maxFrios === 0}
            />
            <p className="text-xs text-muted-foreground">
              Os leads são copiados como pendentes; nenhuma conversa, tarefa ou resultado histórico é movido.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button className="min-h-11" onClick={duplicate} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicar e copiar {effectiveQuantity}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
