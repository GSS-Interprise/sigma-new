import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FiltroTickets } from "./FiltroTickets";
import { TicketCard } from "./TicketCard";
import { TicketDetailDialog } from "./TicketDetailDialog";
import { Loader2 } from "lucide-react";

export function MeuPainelTab() {
  const { user } = useAuth();
  const [numeroTicket, setNumeroTicket] = useState("");
  const [status, setStatus] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [destino, setDestino] = useState("todos");
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    // Garantir consistência caso o status "concluido" esteja selecionado e o checkbox esteja desligado
    if (!mostrarConcluidos && status === "concluido") {
      setStatus("todos");
    }
  }, [mostrarConcluidos, status]);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets', user?.id, numeroTicket, status, tipo, destino, mostrarConcluidos],
    enabled: !!user?.id,
    queryFn: async () => {
      let query = supabase
        .from('suporte_tickets')
        .select('*')
        .order('data_ultima_atualizacao', { ascending: false });

      // Se tiver número do ticket, busca específico
      if (numeroTicket) {
        query = query.eq('numero', numeroTicket);
      } else {
        // Senão, mostra apenas tickets do usuário
        query = query.eq('solicitante_id', user!.id);
      }

      if (status !== "todos") {
        query = query.eq('status', status as any);
      }

      if (tipo !== "todos") {
        query = query.eq('tipo', tipo as any);
      }

      if (destino !== "todos") {
        query = query.eq('destino', destino as any);
      }

      // Por padrão, não mostrar tickets concluídos (apenas quando o checkbox estiver marcado)
      if (!mostrarConcluidos) {
        query = query.neq('status', 'concluido' as any);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const handleTicketClick = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setDetailDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TicketDetailDialog
        ticketId={selectedTicketId}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />
      
      <div className="space-y-6 overflow-auto flex-1">
        <FiltroTickets
          numeroTicket={numeroTicket}
          onNumeroTicketChange={setNumeroTicket}
          status={status}
          onStatusChange={setStatus}
          tipo={tipo}
          onTipoChange={setTipo}
          destino={destino}
          onDestinoChange={setDestino}
          mostrarConcluidos={mostrarConcluidos}
          onMostrarConcluidosChange={setMostrarConcluidos}
        />

        {tickets && tickets.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-4">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => handleTicketClick(ticket.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center p-8 border rounded-lg">
            <p className="text-muted-foreground">
              {numeroTicket 
                ? "Nenhum ticket encontrado com este número"
                : "Você ainda não possui tickets"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
