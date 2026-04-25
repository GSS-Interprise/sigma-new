import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMarcarPerdido } from "@/hooks/useAcompanhamentoLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaLeadId: string;
  leadNome: string;
  onSuccess?: () => void;
}

const MOTIVOS_COMUNS = [
  "Sem fit com o perfil exigido",
  "Valor abaixo da expectativa do médico",
  "Sem disponibilidade na data",
  "Médico mudou de ideia",
  "Já estava em outra agência",
  "Outro",
];

export function MarcarPerdidoDialog({ open, onOpenChange, campanhaLeadId, leadNome, onSuccess }: Props) {
  const [motivoSelecionado, setMotivoSelecionado] = useState("");
  const [motivoCustom, setMotivoCustom] = useState("");
  const marcar = useMarcarPerdido();

  const motivoFinal = motivoSelecionado === "Outro" ? motivoCustom.trim() : motivoSelecionado;
  const podeSalvar = motivoFinal.length >= 3;

  const handleConfirmar = () => {
    if (!podeSalvar) return;
    marcar.mutate(
      { campanha_lead_id: campanhaLeadId, motivo: motivoFinal },
      {
        onSuccess: () => {
          onOpenChange(false);
          setMotivoSelecionado("");
          setMotivoCustom("");
          onSuccess?.();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como perdido</DialogTitle>
          <DialogDescription>
            Por que <strong>{leadNome}</strong> não vai fechar? Essa info vira métrica pra ajustar a IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label className="text-sm">Motivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_COMUNS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivoSelecionado(m)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    motivoSelecionado === m
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {motivoSelecionado === "Outro" && (
            <div className="space-y-2">
              <Label htmlFor="motivo-custom" className="text-sm">
                Descreva
              </Label>
              <Textarea
                id="motivo-custom"
                value={motivoCustom}
                onChange={(e) => setMotivoCustom(e.target.value)}
                placeholder="Motivo específico..."
                className="min-h-[80px]"
                autoFocus
              />
            </div>
          )}

          {motivoSelecionado && motivoSelecionado !== "Outro" && (
            <div className="space-y-2">
              <Label htmlFor="motivo-detalhes" className="text-sm">
                Detalhes (opcional)
              </Label>
              <Textarea
                id="motivo-detalhes"
                value={motivoCustom}
                onChange={(e) => setMotivoCustom(e.target.value)}
                placeholder="Mais contexto se quiser..."
                className="min-h-[60px] text-xs"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={marcar.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmar}
            disabled={!podeSalvar || marcar.isPending}
          >
            {marcar.isPending ? "Salvando..." : "Confirmar perdido"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
