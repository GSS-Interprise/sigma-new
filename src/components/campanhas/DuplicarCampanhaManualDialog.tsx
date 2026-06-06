import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campanha: { id: string; nome: string; total_frio: number | null };
}

// WS4: duplica campanha IA → manual movendo os N leads frios mais antigos (RPC atômica).
export function DuplicarCampanhaManualDialog({ open, onOpenChange, campanha }: Props) {
  const maxFrios = campanha.total_frio || 0;
  const [qtd, setQtd] = useState(Math.min(50, Math.max(1, maxFrios)));
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const efetiva = Math.min(maxFrios, Math.max(1, qtd));

  const duplicar = async () => {
    if (maxFrios === 0) {
      toast.error("Esta campanha não tem leads frios pra mover.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase as any).rpc("duplicar_campanha_para_manual", {
        p_campanha_origem: campanha.id,
        p_qtd_leads: efetiva,
      });
      if (error) throw error;
      toast.success(`Campanha manual criada com ${efetiva} lead(s) — tarefas por canal geradas.`);
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao duplicar: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar pra manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Cria uma cópia <strong>manual</strong> de "{campanha.nome}" e move os{" "}
            <strong>N leads frios mais antigos</strong> pra ela — eles saem da fila da IA e ganham as
            tarefas por canal (WhatsApp/email/IG/telefone).
          </p>
          <div className="space-y-1">
            <Label>Quantos leads mover (de {maxFrios} frios disponíveis)</Label>
            <Input
              type="number"
              min={1}
              max={maxFrios}
              value={qtd}
              onChange={(e) => setQtd(Math.min(maxFrios, Math.max(1, Number(e.target.value) || 1)))}
              disabled={maxFrios === 0}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={duplicar} disabled={loading || maxFrios === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicar e mover {efetiva}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
