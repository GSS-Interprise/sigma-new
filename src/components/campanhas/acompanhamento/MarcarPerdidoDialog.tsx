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
  { value: "Sem interesse", label: "Sem interesse" },
  { value: "Região incompatível", label: "Região incompatível" },
  { value: "Especialidade incompatível", label: "Especialidade incompatível" },
  { value: "Remuneração ou condições incompatíveis", label: "Remuneração/condições" },
  { value: "Sem disponibilidade", label: "Sem disponibilidade" },
  { value: "Já contratado", label: "Já contratado" },
  { value: "Não respondeu após a cadência", label: "Não respondeu após a cadência" },
  {
    value: "solicitou_nao_receber_mensagens",
    label: "Solicitou não receber mensagens",
  },
  { value: "Outro", label: "Outro" },
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
                  key={m.value}
                  type="button"
                  onClick={() => setMotivoSelecionado(m.value)}
                  className={`min-h-11 text-xs px-3 py-2 rounded-full border transition-colors ${
                    motivoSelecionado === m.value
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  {m.label}
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
