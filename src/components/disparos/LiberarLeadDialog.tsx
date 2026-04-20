import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLiberarLead } from "@/hooks/useLiberarLead";
import { Unlock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  leadNome?: string | null;
  campanhaPropostaId: string;
  motivoAnterior?: string | null;
  ultimaDecisaoEm?: string | null;
  ultimoDisparo?: string | null;
  bloqueioJanela7d?: boolean;
  fechadoProposta?: boolean;
  onDone?: () => void;
}

export function LiberarLeadDialog({
  open, onOpenChange, leadId, leadNome, campanhaPropostaId,
  motivoAnterior, ultimaDecisaoEm, ultimoDisparo, bloqueioJanela7d, fechadoProposta, onDone,
}: Props) {
  const [justificativa, setJustificativa] = useState("");
  const liberar = useLiberarLead();

  const handleConfirm = async () => {
    if (!justificativa.trim()) return;
    await liberar.mutateAsync({
      leadId,
      campanhaPropostaId,
      justificativa: justificativa.trim(),
      motivoAnterior: motivoAnterior ?? null,
    });
    setJustificativa("");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Unlock className="h-5 w-5 text-primary" /> Liberar lead
          </DialogTitle>
          <DialogDescription>
            {leadNome ? <strong>{leadNome}</strong> : "Lead"} será reaberto na Fase 1 (WhatsApp + Tráfego Pago) desta proposta.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 text-amber-600" /> Motivo do bloqueio atual
          </div>
          {fechadoProposta && (
            <div>
              Fechado nesta proposta{ultimaDecisaoEm ? ` em ${format(new Date(ultimaDecisaoEm), "dd/MM/yyyy")}` : ""}
              {motivoAnterior ? ` — "${motivoAnterior}"` : ""}.
            </div>
          )}
          {bloqueioJanela7d && ultimoDisparo && (
            <div>Recebeu disparo em {format(new Date(ultimoDisparo), "dd/MM/yyyy")} (janela de 7 dias).</div>
          )}
          {!fechadoProposta && !bloqueioJanela7d && (
            <div className="text-muted-foreground">Lead disponível para liberação manual.</div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="just">Justificativa da liberação *</Label>
          <Textarea
            id="just"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex: Nova proposta com valor maior, lead pediu para ser contactado novamente..."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!justificativa.trim() || liberar.isPending}
          >
            {liberar.isPending ? "Liberando..." : "Confirmar liberação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
