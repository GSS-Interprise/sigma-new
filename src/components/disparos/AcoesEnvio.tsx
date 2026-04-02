import { Button } from "@/components/ui/button";
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
import { Send, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AcoesEnvioProps {
  especialidade: string;
  estado: string;
  mensagem: string;
  totalDestinatarios: number;
  onEnviar: () => void;
  isLoading: boolean;
}

export function AcoesEnvio({
  especialidade,
  estado,
  mensagem,
  totalDestinatarios,
  onEnviar,
  isLoading,
}: AcoesEnvioProps) {
  const isDisabled =
    !especialidade || !mensagem.trim() || totalDestinatarios === 0 || isLoading;

  if (especialidade && totalDestinatarios === 0) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Nenhum médico encontrado com os filtros selecionados. Ajuste os
          filtros para continuar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="lg" disabled={isDisabled} className="w-full md:w-auto">
          <Send className="mr-2 h-4 w-4" />
          {isLoading ? "Enviando..." : "Enviar Disparos"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Envio de Disparos</AlertDialogTitle>
          <AlertDialogDescription>
            Você enviará a mensagem para{" "}
            <strong>{totalDestinatarios} médico{totalDestinatarios !== 1 ? "s" : ""}</strong>{" "}
            da especialidade <strong>{especialidade}</strong>
            {estado && (
              <>
                {" "}
                no estado <strong>{estado}</strong>
              </>
            )}
            . Deseja confirmar?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onEnviar}>
            Confirmar Envio
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
