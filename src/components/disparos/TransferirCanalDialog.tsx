import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CanalCascata,
  useTransferirLeadsCanal,
  useFecharLeadsCanal,
} from "@/hooks/useLeadCanais";

const CANAIS: { value: CanalCascata; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "trafego_pago", label: "Tráfego Pago" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "ligacao", label: "Ligação" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: "transferir" | "fechar";
  campanhaPropostaId: string;
  canalAtual: CanalCascata;
  leadIds: string[];
  onDone?: () => void;
}

export function TransferirCanalDialog({
  open,
  onOpenChange,
  modo,
  campanhaPropostaId,
  canalAtual,
  leadIds,
  onDone,
}: Props) {
  const [proximoCanal, setProximoCanal] = useState<CanalCascata>("email");
  const [statusFinal, setStatusFinal] = useState<
    "respondeu" | "convertido" | "descartado" | "fechado"
  >("fechado");
  const [motivo, setMotivo] = useState("");
  const transferir = useTransferirLeadsCanal();
  const fechar = useFecharLeadsCanal();

  const isLoading = transferir.isPending || fechar.isPending;
  const isTransferir = modo === "transferir";

  const handleConfirm = async () => {
    if (!motivo.trim()) return;
    if (isTransferir) {
      await transferir.mutateAsync({
        campanhaPropostaId,
        leadIds,
        canalAtual,
        proximoCanal,
        motivo,
      });
    } else {
      await fechar.mutateAsync({
        campanhaPropostaId,
        leadIds,
        canal: canalAtual,
        statusFinal,
        motivo,
      });
    }
    setMotivo("");
    onOpenChange(false);
    onDone?.();
  };

  const canaisDisponiveis = CANAIS.filter((c) => c.value !== canalAtual);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isTransferir ? "Transferir leads" : "Encerrar leads"}
          </DialogTitle>
          <DialogDescription>
            {leadIds.length} lead(s) selecionado(s) no canal{" "}
            <strong>{canalAtual}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isTransferir ? (
            <div className="space-y-2">
              <Label>Canal destino</Label>
              <Select
                value={proximoCanal}
                onValueChange={(v) => setProximoCanal(v as CanalCascata)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canaisDisponiveis.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Status final</Label>
              <Select
                value={statusFinal}
                onValueChange={(v) => setStatusFinal(v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="respondeu">Respondeu</SelectItem>
                  <SelectItem value="convertido">Convertido</SelectItem>
                  <SelectItem value="descartado">Descartado</SelectItem>
                  <SelectItem value="fechado">Fechado (sem resposta)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                isTransferir
                  ? "Por que está transferindo? (ex: sem resposta há 3 dias)"
                  : "Por que está encerrando neste canal?"
              }
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || !motivo.trim() || leadIds.length === 0}
          >
            {isLoading ? "Processando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}