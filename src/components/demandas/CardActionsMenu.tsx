import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, ListTodo } from "lucide-react";
import {
  TarefaRapidaDialog,
  type VinculoTipo,
} from "./TarefaRapidaDialog";
import { cn } from "@/lib/utils";

interface Props {
  tipo: VinculoTipo;
  recursoId: string;
  /** Texto descritivo do recurso (vai aparecer no header do modal) */
  label: string;
  /** Tamanho do botão. Default: "icon-sm" */
  size?: "icon-sm" | "icon";
  className?: string;
}

/**
 * Menu de 3 pontinhos para cards. Hoje só tem "Criar tarefa",
 * mas dá pra adicionar mais ações no futuro.
 */
export function CardActionsMenu({
  tipo,
  recursoId,
  label,
  size = "icon-sm",
  className,
}: Props) {
  const [tarefaOpen, setTarefaOpen] = useState(false);

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              size === "icon-sm" ? "h-7 w-7" : "h-8 w-8",
              "shrink-0",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical
              className={size === "icon-sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
            />
            <span className="sr-only">Abrir ações</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTarefaOpen(true);
            }}
            className="gap-2 cursor-pointer"
          >
            <ListTodo className="h-4 w-4" />
            Criar tarefa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TarefaRapidaDialog
        open={tarefaOpen}
        onOpenChange={setTarefaOpen}
        vinculo={{ tipo, id: recursoId, label }}
      />
    </span>
  );
}
