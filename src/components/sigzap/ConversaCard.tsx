import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare } from "lucide-react";
import { CardActionsMenu } from "@/components/demandas/CardActionsMenu";

interface ConversaCardProps {
  conversa: {
    id: string;
    id_conversa: string;
    nome_contato: string;
    numero_contato: string;
    updated_at?: string | null;
    created_at?: string | null;
  };
  isSelected: boolean;
  onClick: () => void;
}

export function ConversaCard({ conversa, isSelected, onClick }: ConversaCardProps) {
  const lastUpdate = conversa.updated_at || conversa.created_at;
  
  return (
    <Card
      className={cn(
        "p-3 cursor-pointer transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary bg-primary/5"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{conversa.nome_contato}</h4>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {conversa.numero_contato}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] h-5">
              Aberto
            </Badge>
            <CardActionsMenu
              tipo="sigzap"
              recursoId={conversa.id}
              label={`${conversa.nome_contato} (${conversa.numero_contato})`}
            />
          </div>
          {lastUpdate && (
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(lastUpdate), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t text-muted-foreground">
        <MessageSquare className="h-3 w-3 flex-shrink-0" />
        <p className="text-xs">Clique para ver mensagens</p>
      </div>
    </Card>
  );
}
