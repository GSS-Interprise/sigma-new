import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Inbox, User, MessageCircle, CheckCircle, Archive } from "lucide-react";

export type FiltroStatus = "todos" | "minha_fila" | "em_atendimento" | "concluido" | "arquivado";

interface FiltroConversasProps {
  filtroAtivo: FiltroStatus;
  onFiltroChange: (filtro: FiltroStatus) => void;
}

const filtros = [
  { id: "todos" as FiltroStatus, label: "Todos", icon: Inbox },
  { id: "minha_fila" as FiltroStatus, label: "Minha Fila", icon: User },
  { id: "em_atendimento" as FiltroStatus, label: "Em Atendimento", icon: MessageCircle },
  { id: "concluido" as FiltroStatus, label: "Concluídos", icon: CheckCircle },
  { id: "arquivado" as FiltroStatus, label: "Arquivados", icon: Archive },
];

export function FiltroConversas({ filtroAtivo, onFiltroChange }: FiltroConversasProps) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
        Filtros
      </h3>
      {filtros.map((filtro) => (
        <Button
          key={filtro.id}
          variant={filtroAtivo === filtro.id ? "secondary" : "ghost"}
          className={cn(
            "justify-start gap-2 h-9",
            filtroAtivo === filtro.id && "bg-primary/10 text-primary"
          )}
          onClick={() => onFiltroChange(filtro.id)}
        >
          <filtro.icon className="h-4 w-4" />
          <span className="text-sm">{filtro.label}</span>
        </Button>
      ))}
    </div>
  );
}
