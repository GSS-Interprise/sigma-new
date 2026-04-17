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
import { Lock } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCaptacaoPermissions } from "@/hooks/useCaptacaoPermissions";
import { useEncerrarCampanhaProposta } from "@/hooks/useCampanhaPropostas";

interface Props {
  campanhaPropostaId: string;
  todosLeadsFechados: boolean;
}

export function EncerrarCampanhaButton({ campanhaPropostaId, todosLeadsFechados }: Props) {
  const { isAdmin } = usePermissions();
  const { isCaptacaoLeader } = useCaptacaoPermissions();
  const encerrar = useEncerrarCampanhaProposta();

  const podeEncerrar = isAdmin || isCaptacaoLeader;
  if (!podeEncerrar) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          disabled={!todosLeadsFechados || encerrar.isPending}
          title={!todosLeadsFechados ? "Encerre todos os leads primeiro" : "Encerrar campanha"}
        >
          <Lock className="h-4 w-4 mr-2" />
          Encerrar campanha
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encerrar esta campanha?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação marca a campanha como encerrada. Apenas admins ou líderes de captação
            podem realizar essa operação.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => encerrar.mutate(campanhaPropostaId)}>
            Encerrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
