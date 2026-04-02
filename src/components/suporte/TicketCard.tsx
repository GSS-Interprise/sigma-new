import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, Calendar, User, CheckCircle, XCircle, BellRing } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface TicketCardProps {
  ticket: {
    id: string;
    numero: string;
    descricao: string;
    status: string;
    tipo: string;
    destino: string;
    data_abertura: string;
    data_ultima_atualizacao: string;
    solicitante_nome: string;
    solicitante_id?: string;
  };
  onClick: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  aberto: "bg-gray-500",
  pendente: "bg-yellow-500",
  em_analise: "bg-blue-500",
  aguardando_usuario: "bg-orange-500",
  em_validacao: "bg-purple-500",
  aguardando_confirmacao: "bg-cyan-500",
  concluido: "bg-green-500",
};

const STATUS_LABELS: Record<string, string> = {
  aberto: "Aberto",
  pendente: "Pendente",
  em_analise: "Em Análise",
  aguardando_usuario: "Aguardando Usuário",
  em_validacao: "Em Validação",
  aguardando_confirmacao: "Aguardando Confirmação",
  concluido: "Concluído",
};

const TIPO_LABELS: Record<string, string> = {
  software: "Software",
  hardware: "Hardware",
};

const DESTINO_LABELS: Record<string, string> = {
  interno: "Interno",
  externo: "Externo",
};

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAguardandoConfirmacao = ticket.status === 'aguardando_confirmacao';
  const isOwner = ticket.solicitante_id === user?.id;

  const confirmarMutation = useMutation({
    mutationFn: async (resolvido: boolean) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const novoStatus = resolvido ? 'concluido' : 'em_analise';

      const { error: updateError } = await supabase
        .from('suporte_tickets')
        .update({
          status: novoStatus,
          data_ultima_atualizacao: new Date().toISOString(),
          ...(resolvido && { data_conclusao: new Date().toISOString() })
        })
        .eq('id', ticket.id);

      if (updateError) throw updateError;

      const { data: profile } = await supabase
        .from('profiles')
        .select('nome_completo')
        .eq('id', user.id)
        .single();

      const autorNome = profile?.nome_completo || user?.email || 'Usuário';
      const mensagem = resolvido
        ? `${autorNome} confirmou que o problema foi resolvido.`
        : `${autorNome} informou que o problema ainda persiste. O ticket foi reaberto.`;

      await supabase
        .from('suporte_comentarios')
        .insert({
          ticket_id: ticket.id,
          autor_id: user.id,
          autor_nome: autorNome,
          autor_email: user?.email || '',
          mensagem,
          is_externo: false,
        });
    },
    onSuccess: (_, resolvido) => {
      toast.success(resolvido ? "Ticket finalizado!" : "Ticket reaberto para análise.");
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tickets-kanban'] });
    },
    onError: () => {
      toast.error("Erro ao confirmar resolução");
    },
  });

  const handleConfirm = (e: React.MouseEvent, resolvido: boolean) => {
    e.stopPropagation();
    confirmarMutation.mutate(resolvido);
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-lg transition-shadow ${isAguardandoConfirmacao && isOwner ? 'ring-2 ring-cyan-400 border-cyan-300' : ''} ${ticket.destino === 'externo' ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg font-semibold truncate">
              {ticket.numero}
            </CardTitle>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {ticket.descricao}
            </p>
          </div>
          <Badge className={`${STATUS_COLORS[ticket.status] || 'bg-gray-500'} flex-shrink-0 whitespace-nowrap text-xs`}>
            {STATUS_LABELS[ticket.status] || ticket.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Indicador de ação necessária */}
        {isAguardandoConfirmacao && isOwner && (
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-cyan-800 text-sm font-medium">
              <BellRing className="h-4 w-4 text-cyan-600 animate-pulse" />
              Sua confirmação é necessária
            </div>
            <p className="text-xs text-cyan-700">O problema foi resolvido?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={(e) => handleConfirm(e, true)}
                disabled={confirmarMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-xs h-8"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Sim, finalizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => handleConfirm(e, false)}
                disabled={confirmarMutation.isPending}
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50 text-xs h-8"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Não resolvido
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="text-xs">
            {TIPO_LABELS[ticket.tipo] || ticket.tipo}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {DESTINO_LABELS[ticket.destino] || ticket.destino}
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(ticket.data_abertura), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Clock className="h-3 w-3" />
            <span className="truncate">{format(new Date(ticket.data_ultima_atualizacao), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <User className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{ticket.solicitante_nome}</span>
        </div>
      </CardContent>
    </Card>
  );
}
