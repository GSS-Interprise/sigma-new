import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  User,
  MessageSquare,
  FileText,
  Edit,
  Paperclip,
  Check
} from "lucide-react";
import { format, formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Profile {
  nome_completo: string;
}

interface Atividade {
  id: string;
  tipo: string;
  descricao: string;
  created_at: string;
  campo_alterado?: string | null;
  valor_antigo?: string | null;
  valor_novo?: string | null;
  profiles?: Profile | null;
  resposta_esperada_ate?: string | null;
  responsavel_resposta_id?: string | null;
  setor_responsavel?: string | null;
  respondido_em?: string | null;
  respondido_por?: string | null;
  is_critico?: boolean;
  responsavel_resposta?: Profile | null;
  respondido_por_profile?: Profile | null;
}

interface LicitacaoAtividadeItemProps {
  atividade: Atividade;
  isLast: boolean;
  licitacaoId: string;
}

function getAtividadeIcon(tipo: string) {
  switch (tipo) {
    case 'comentario':
      return <MessageSquare className="h-3.5 w-3.5" />;
    case 'status_alterado':
      return <FileText className="h-3.5 w-3.5" />;
    case 'campo_atualizado':
      return <Edit className="h-3.5 w-3.5" />;
    case 'anexo_adicionado':
      return <Paperclip className="h-3.5 w-3.5" />;
    default:
      return <MessageSquare className="h-3.5 w-3.5" />;
  }
}

// Re-export linkifyText from shared utility for backward compatibility
import { linkifyText } from "@/lib/linkify";

function getStatusResposta(respostaEsperadaAte: string | null, respondidoEm: string | null): {
  status: 'respondido' | 'vencido' | 'proximo' | 'dentro_prazo' | null;
  label: string;
  color: string;
  icon: React.ReactNode;
} | null {
  if (!respostaEsperadaAte) return null;
  
  if (respondidoEm) {
    return {
      status: 'respondido',
      label: 'Respondido',
      color: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle2 className="h-3 w-3" />
    };
  }
  
  const prazo = new Date(respostaEsperadaAte);
  const agora = new Date();
  const horasRestantes = differenceInHours(prazo, agora);
  
  if (isPast(prazo)) {
    return {
      status: 'vencido',
      label: 'Prazo vencido',
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: <AlertTriangle className="h-3 w-3" />
    };
  }
  
  if (horasRestantes <= 24) {
    return {
      status: 'proximo',
      label: 'Prazo próximo',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      icon: <Clock className="h-3 w-3" />
    };
  }
  
  return {
    status: 'dentro_prazo',
    label: 'Dentro do prazo',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: <Clock className="h-3 w-3" />
  };
}

export function LicitacaoAtividadeItem({ atividade, isLast, licitacaoId }: LicitacaoAtividadeItemProps) {
  const queryClient = useQueryClient();
  const statusResposta = getStatusResposta(
    atividade.resposta_esperada_ate || null, 
    atividade.respondido_em || null
  );

  const marcarRespondidoMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("licitacoes_atividades")
        .update({
          respondido_em: new Date().toISOString(),
          respondido_por: userData.user.id,
        })
        .eq("id", atividade.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licitacoes-atividades", licitacaoId] });
      toast.success("Mensagem marcada como respondida");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao marcar como respondida");
    },
  });

  const needsResponse = atividade.resposta_esperada_ate && !atividade.respondido_em;

  return (
    <div 
      className={cn(
        "px-4 py-3 hover:bg-muted/50 transition-colors",
        !isLast && "border-b border-border/50",
        atividade.is_critico && !atividade.respondido_em && "bg-destructive/5 border-l-2 border-l-destructive"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarFallback className={cn(
            "text-xs font-medium",
            atividade.is_critico ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"
          )}>
            {atividade.profiles?.nome_completo?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {atividade.profiles?.nome_completo || "Sistema"}
              </span>
              {atividade.is_critico && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-0.5" />
                        Crítico
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mensagem marcada como crítica - requer atenção urgente</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {format(new Date(atividade.created_at), "dd MMM 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
          
          <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <span className="flex-shrink-0 mt-0.5">{getAtividadeIcon(atividade.tipo)}</span>
            <span className="break-words overflow-hidden [&_a]:relative [&_a]:z-10">
              {atividade.tipo === 'campo_atualizado' ? 'editou' : linkifyText(atividade.descricao)}
            </span>
          </div>
          
          {/* Mostrar campos alterados */}
          {atividade.campo_alterado && atividade.valor_antigo && atividade.valor_novo && (
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground capitalize">{atividade.campo_alterado.replace(/_/g, ' ')}</div>
              <div className="flex items-center gap-1.5 text-xs">
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs px-1.5 py-0">
                  {(atividade.valor_antigo?.length || 0) > 30 ? atividade.valor_antigo?.slice(0, 30) + '...' : atividade.valor_antigo}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs px-1.5 py-0">
                  {(atividade.valor_novo?.length || 0) > 30 ? atividade.valor_novo?.slice(0, 30) + '...' : atividade.valor_novo}
                </Badge>
              </div>
            </div>
          )}

          {/* Informações de prazo de resposta */}
          {atividade.resposta_esperada_ate && (
            <div className="mt-2 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {statusResposta && (
                  <Badge variant="outline" className={cn("text-[10px] h-5", statusResposta.color)}>
                    {statusResposta.icon}
                    <span className="ml-1">{statusResposta.label}</span>
                  </Badge>
                )}
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] h-5 bg-muted">
                        <Clock className="h-3 w-3 mr-1" />
                        {format(new Date(atividade.resposta_esperada_ate), "dd/MM HH:mm", { locale: ptBR })}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Resposta esperada até {format(new Date(atividade.resposta_esperada_ate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                      {!atividade.respondido_em && (
                        <p className="text-muted-foreground">
                          {isPast(new Date(atividade.resposta_esperada_ate)) 
                            ? `Vencido há ${formatDistanceToNow(new Date(atividade.resposta_esperada_ate), { locale: ptBR })}`
                            : `Faltam ${formatDistanceToNow(new Date(atividade.resposta_esperada_ate), { locale: ptBR })}`
                          }
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {atividade.responsavel_resposta_id && (
                  <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-700 border-blue-200">
                    <User className="h-3 w-3 mr-1" />
                    {atividade.responsavel_resposta?.nome_completo?.split(' ').slice(0, 2).join(' ') || 'Usuário'}
                  </Badge>
                )}

                {atividade.setor_responsavel && (
                  <Badge variant="outline" className="text-[10px] h-5 bg-purple-50 text-purple-700 border-purple-200">
                    {atividade.setor_responsavel}
                  </Badge>
                )}
              </div>

              {/* Informação de resposta */}
              {atividade.respondido_em && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Respondido em {format(new Date(atividade.respondido_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {atividade.respondido_por_profile && (
                    <span> por {atividade.respondido_por_profile.nome_completo?.split(' ').slice(0, 2).join(' ')}</span>
                  )}
                </div>
              )}

              {/* Botão para marcar como respondido */}
              {needsResponse && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs mt-1"
                  onClick={() => marcarRespondidoMutation.mutate()}
                  disabled={marcarRespondidoMutation.isPending}
                >
                  <Check className="h-3 w-3 mr-1" />
                  {marcarRespondidoMutation.isPending ? "Marcando..." : "Marcar como respondido"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
