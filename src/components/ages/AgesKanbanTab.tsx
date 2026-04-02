import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Building2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import AgesLicitacaoDialog from "./AgesLicitacaoDialog";

interface AgesLicitacao {
  id: string;
  licitacao_id: string | null;
  status: string;
  prazo_retorno_gss: string | null;
  prazo_licitacao: string | null;
  responsavel_id: string | null;
  observacoes: string | null;
  licitacao?: {
    id: string;
    titulo: string;
    numero_edital: string;
    orgao: string;
    objeto: string;
    valor_estimado: number | null;
  };
}

const AgesKanbanTab = () => {
  const queryClient = useQueryClient();
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [selectedLicitacao, setSelectedLicitacao] = useState<AgesLicitacao | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: columns = [], isLoading: columnsLoading } = useKanbanColumns("ages_licitacoes");

  const { data: licitacoes = [], isLoading: licitacoesLoading } = useQuery({
    queryKey: ["ages-licitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_licitacoes")
        .select(`
          *,
          licitacao:licitacoes(id, titulo, numero_edital, orgao, objeto, valor_estimado)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AgesLicitacao[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("ages_licitacoes")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-licitacoes"] });
      toast.success("Status atualizado");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  const getCardsByStatus = (statusId: string) => {
    return licitacoes.filter((l) => l.status === statusId);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCard(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, statusId: string) => {
    e.preventDefault();
    if (draggedCard) {
      updateStatusMutation.mutate({ id: draggedCard, status: statusId });
      setDraggedCard(null);
    }
  };

  const getPrazoColor = (prazo: string | null) => {
    if (!prazo) return "text-muted-foreground";
    const days = differenceInDays(new Date(prazo), new Date());
    if (days < 0) return "text-destructive";
    if (days <= 3) return "text-amber-500";
    return "text-muted-foreground";
  };

  if (columnsLoading || licitacoesLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setSelectedLicitacao(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Vincular Licitação
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {columns.map((column) => {
            const cards = getCardsByStatus(column.id);
            return (
              <Card
                key={column.id}
                className="w-72 flex-shrink-0 flex flex-col bg-muted/30"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <div
                  className="p-3 border-b flex items-center justify-between"
                  style={{ borderLeftColor: column.cor, borderLeftWidth: 4 }}
                >
                  <span className="font-medium text-sm">{column.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {cards.length}
                  </Badge>
                </div>

                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {cards.map((card) => (
                      <Card
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        onClick={() => { setSelectedLicitacao(card); setDialogOpen(true); }}
                        className="p-3 cursor-pointer hover:shadow-md transition-shadow bg-background"
                      >
                        <p className="font-medium text-sm line-clamp-2 mb-2">
                          {card.licitacao?.titulo || "Sem título"}
                        </p>
                        
                        {card.licitacao?.orgao && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <Building2 className="h-3 w-3" />
                            <span className="line-clamp-1">{card.licitacao.orgao}</span>
                          </div>
                        )}

                        {card.prazo_retorno_gss && (
                          <div className={`flex items-center gap-1 text-xs ${getPrazoColor(card.prazo_retorno_gss)}`}>
                            <AlertCircle className="h-3 w-3" />
                            <span>Retorno GSS: {format(new Date(card.prazo_retorno_gss), "dd/MM/yy", { locale: ptBR })}</span>
                          </div>
                        )}

                        {card.prazo_licitacao && (
                          <div className={`flex items-center gap-1 text-xs ${getPrazoColor(card.prazo_licitacao)}`}>
                            <Calendar className="h-3 w-3" />
                            <span>Prazo: {format(new Date(card.prazo_licitacao), "dd/MM/yy", { locale: ptBR })}</span>
                          </div>
                        )}
                      </Card>
                    ))}

                    {cards.length === 0 && (
                      <div className="text-center text-muted-foreground text-xs py-8">
                        Nenhum item
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            );
          })}
        </div>
      </div>

      <AgesLicitacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        licitacao={selectedLicitacao}
      />
    </div>
  );
};

export default AgesKanbanTab;
