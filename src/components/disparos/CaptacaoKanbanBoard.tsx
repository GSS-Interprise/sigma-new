import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, GripVertical, FileText, Building2, MapPin, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type OrigemTipo = "manual" | "licitacao_arrematada";
type StatusBoard = "prospectar" | "analisando" | "em_andamento" | "completo" | "descarte";

interface CaptacaoCard {
  id: string;
  origem_tipo: OrigemTipo;
  origem_licitacao_id: string | null;
  contrato_id: string | null;
  status: StatusBoard;
  titulo_card: string;
  overlay_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const KANBAN_COLUMNS: { id: StatusBoard; label: string; color: string }[] = [
  { id: "prospectar", label: "Prospectar", color: "bg-blue-500" },
  { id: "analisando", label: "Analisando", color: "bg-yellow-500" },
  { id: "em_andamento", label: "Em Andamento", color: "bg-orange-500" },
  { id: "completo", label: "Completo", color: "bg-green-500" },
  { id: "descarte", label: "Descarte", color: "bg-red-500" },
];

export function CaptacaoKanbanBoard() {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");
  const [draggedCard, setDraggedCard] = useState<CaptacaoCard | null>(null);

  // Fetch all board cards
  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["captacao-contratos-board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("captacao_contratos_board")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CaptacaoCard[];
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("captacao-board-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "captacao_contratos_board" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["captacao-contratos-board"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Create manual card
  const createCard = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("captacao_contratos_board").insert({
        origem_tipo: "manual" as OrigemTipo,
        status: "prospectar" as StatusBoard,
        titulo_card: novoTitulo,
        overlay_json: { descricao: novaDescricao },
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captacao-contratos-board"] });
      setAddDialogOpen(false);
      setNovoTitulo("");
      setNovaDescricao("");
      toast.success("Card adicionado ao Kanban!");
    },
    onError: () => toast.error("Erro ao criar card"),
  });

  // Update card status (drag & drop)
  const updateCardStatus = useMutation({
    mutationFn: async ({ cardId, newStatus }: { cardId: string; newStatus: StatusBoard }) => {
      const { error } = await supabase
        .from("captacao_contratos_board")
        .update({ status: newStatus })
        .eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captacao-contratos-board"] });
    },
    onError: () => toast.error("Erro ao mover card"),
  });

  // Delete card
  const deleteCard = useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase
        .from("captacao_contratos_board")
        .delete()
        .eq("id", cardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["captacao-contratos-board"] });
      toast.success("Card removido!");
    },
    onError: () => toast.error("Erro ao remover card"),
  });

  const handleDragStart = (e: React.DragEvent, card: CaptacaoCard) => {
    setDraggedCard(card);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStatus: StatusBoard) => {
    e.preventDefault();
    if (draggedCard && draggedCard.status !== targetStatus) {
      updateCardStatus.mutate({ cardId: draggedCard.id, newStatus: targetStatus });
    }
    setDraggedCard(null);
  };

  const getCardsForColumn = (status: StatusBoard) => {
    return cards.filter((card) => card.status === status);
  };

  const renderCard = (card: CaptacaoCard) => {
    const overlay = card.overlay_json || {};
    const isFromLicitacao = card.origem_tipo === "licitacao_arrematada";

    return (
      <Card
        key={card.id}
        draggable
        onDragStart={(e) => handleDragStart(e, card)}
        className="p-3 mb-2 cursor-grab active:cursor-grabbing bg-card hover:bg-accent/50 transition-colors border shadow-sm"
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium truncate">{card.titulo_card}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteCard.mutate(card.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-1 mt-2">
              <Badge variant={isFromLicitacao ? "default" : "secondary"} className="text-xs">
                {isFromLicitacao ? "Licitação" : "Manual"}
              </Badge>
              {overlay.uf && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  {String(overlay.uf)}
                </Badge>
              )}
            </div>

            {overlay.orgao && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span className="truncate">{String(overlay.orgao)}</span>
              </div>
            )}

            {overlay.descricao && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {String(overlay.descricao)}
              </p>
            )}

            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(card.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </div>
          </div>
        </div>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {cards.length} cards no board
          </Badge>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Card
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-4 min-h-[600px]">
        {KANBAN_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex flex-col bg-muted/30 rounded-lg border"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`${column.color} text-white px-3 py-2 rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{column.label}</h3>
                <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                  {getCardsForColumn(column.id).length}
                </Badge>
              </div>
            </div>

            {/* Column Content */}
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-2">
                {getCardsForColumn(column.id).map((card) => renderCard(card))}
                
                {getCardsForColumn(column.id).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum card
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      {/* Add Card Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Card Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="titulo">Título do Card *</Label>
              <Input
                id="titulo"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                placeholder="Ex: Contrato Hospital X"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição (opcional)</Label>
              <Textarea
                id="descricao"
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
                placeholder="Detalhes adicionais..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createCard.mutate()}
              disabled={!novoTitulo.trim() || createCard.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
