import { ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface Props {
  /** Elemento que dispara o dialog (geralmente um Button) */
  trigger: ReactNode;
  /** Título — Ex: "Apagar campanha?" */
  title: string;
  /** Descrição do impacto — Ex: "Isso vai parar todos os disparos e remover as métricas." */
  description: ReactNode;
  /** Label do botão de confirmação. Default: "Confirmar". */
  confirmLabel?: string;
  /** Label do botão de cancelar. Default: "Cancelar". */
  cancelLabel?: string;
  /**
   * Palavra/frase que o usuário precisa digitar pra confirmar (ex: nome do recurso,
   * "EXCLUIR"). Se omitido, basta clicar Confirmar.
   */
  requireType?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Fase C — Wrapper padrão pra confirmações de ações destrutivas.
 *
 * Usar em qualquer botão que apague, pause, cancele ou faça mudança difícil de
 * desfazer. Reduz acidentes (heurística de Nielsen: prevenção de erros) sem
 * empilhar dialogs ad-hoc por toda a base.
 *
 * Variantes:
 * - Confirmação simples (sem typing): usuário clica Confirmar
 * - Confirmação forte (requireType): usuário precisa digitar a palavra exata
 *   (ex: nome da campanha) pra habilitar o Confirmar
 */
export function ConfirmDestructive({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  requireType,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);

  const canConfirm = !requireType || typed.trim() === requireType.trim();

  const handleConfirm = async () => {
    await onConfirm();
    setTyped("");
    setOpen(false);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requireType && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-type" className="text-xs">
              Pra confirmar, digite <span className="font-semibold">{requireType}</span> abaixo:
            </Label>
            <Input
              id="confirm-type"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireType}
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(e) => {
              e.preventDefault();
              if (canConfirm) handleConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
