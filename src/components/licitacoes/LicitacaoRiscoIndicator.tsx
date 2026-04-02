import { AlertTriangle, Clock, MessageSquareWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LicitacaoRiscoIndicatorProps {
  temMensagemCriticaPendente?: boolean;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function LicitacaoRiscoIndicator({ 
  temMensagemCriticaPendente, 
  className,
  showLabel = false,
  size = 'sm'
}: LicitacaoRiscoIndicatorProps) {
  if (!temMensagemCriticaPendente) return null;

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="destructive" 
            className={cn(
              "cursor-help animate-pulse",
              size === 'sm' ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
              className
            )}
          >
            <MessageSquareWarning className={cn(iconSize, showLabel && "mr-1")} />
            {showLabel && "Mensagem crítica pendente"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Risco de Comunicação</p>
              <p className="text-sm text-muted-foreground">
                Existe uma ou mais mensagens críticas aguardando resposta nesta licitação.
                Verifique o histórico de atividades.
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Componente menor para uso em cards do Kanban
export function LicitacaoRiscoIcon({ 
  temMensagemCriticaPendente 
}: { 
  temMensagemCriticaPendente?: boolean 
}) {
  if (!temMensagemCriticaPendente) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="text-destructive animate-pulse">
            <MessageSquareWarning className="h-4 w-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Mensagem crítica pendente</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
