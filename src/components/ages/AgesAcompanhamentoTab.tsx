import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { User, Phone, Mail, Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";
import { AgesKanbanCardDialog } from "./AgesKanbanCardDialog";
import { NovoMedicoKanbanCardDialog } from "@/components/medicos/NovoMedicoKanbanCardDialog";
import { KanbanStatusManager } from "@/components/licitacoes/KanbanStatusManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AgesKanbanCard = {
  id: string;
  nome: string;
  profissao: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  status: string;
  created_at: string;
};

const PROFISSOES = [
  "Enfermeiro(a)",
  "Técnico(a) de Enfermagem",
  "Fisioterapeuta",
  "Fonoaudiólogo(a)",
  "Nutricionista",
  "Psicólogo(a)",
  "Assistente Social",
  "Técnico(a) em Radiologia",
  "Farmacêutico(a)",
  "Biomédico(a)",
  "Terapeuta Ocupacional",
  "Médico(a)",
  "Outro"
];

export default function AgesAcompanhamentoTab() {
  const queryClient = useQueryClient();
  const [selectedCard, setSelectedCard] = useState<AgesKanbanCard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [novoCardDialogOpen, setNovoCardDialogOpen] = useState(false);
  const [novoCard, setNovoCard] = useState({
    nome: '',
    profissao: '',
    telefone: '',
    email: '',
  });

  // Usar colunas do módulo ages_leads
  const { data: columns = [], isLoading: loadingColumns } = useKanbanColumns('ages_leads');

  // Buscar leads da AGES como cards (exclui convertidos/que já viraram profissional)
  const { data: cards, isLoading: loadingCards } = useQuery<AgesKanbanCard[]>({
    queryKey: ['ages-kanban-cards'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('ages_leads')
        .select('*')
        .neq('status', 'convertido')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const { data: profissionais, error: profError } = await supabase
        .from('ages_profissionais')
        .select('lead_origem_id');
      if (profError) throw profError;

      const convertedLeadIds = new Set(
        (profissionais || [])
          .map((p) => (p as any).lead_origem_id as string | null)
          .filter(Boolean)
      );

      return (leads || []).filter((l) => !convertedLeadIds.has(l.id));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('ages_leads')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-kanban-cards'] });
      toast.success('Status atualizado');
    },
  });

  const createCardMutation = useMutation({
    mutationFn: async (data: typeof novoCard) => {
      if (!data.nome.trim()) throw new Error('Nome é obrigatório');
      
      // Pegar a primeira coluna como status inicial
      const primeiroStatus = columns[0]?.id || 'novo';
      
      const { error } = await supabase
        .from('ages_leads')
        .insert({
          nome: data.nome,
          profissao: data.profissao || null,
          telefone: data.telefone || null,
          email: data.email || null,
          status: primeiroStatus,
          origem: 'Kanban AGES',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-kanban-cards'] });
      toast.success('Card criado com sucesso');
      setNovoCardDialogOpen(false);
      setNovoCard({ nome: '', profissao: '', telefone: '', email: '' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar card');
    },
  });

  const getCardsByStatus = (status: string) => {
    return cards?.filter(card => card.status === status) || [];
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData('cardId', cardId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData('cardId');
    if (cardId) {
      updateStatusMutation.mutate({ id: cardId, status: newStatus });
    }
  };

  const handleCardClick = (card: AgesKanbanCard) => {
    setSelectedCard(card);
    setDialogOpen(true);
  };

  if (loadingColumns || loadingCards) {
    return <div className="p-4">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Acompanhamento AGES</h2>
        <div className="flex gap-2">
          <KanbanStatusManager modulo="ages_leads" />
          <Button onClick={() => setNovoCardDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Card
          </Button>
        </div>
      </div>

      <div className="flex gap-2 sm:gap-3 overflow-x-auto h-[calc(100vh-280px)] pb-2 px-1">
        {columns.map((column) => (
          <Card 
            key={column.id} 
            className="w-[260px] sm:w-[280px] md:w-[300px] flex-shrink-0 flex flex-col h-full"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="h-2 w-2 rounded-full" 
                    style={{ backgroundColor: column.cor || 'hsl(var(--primary))' }}
                  />
                  <span className="truncate">{column.label}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {getCardsByStatus(column.id).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pt-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-3">
                  {getCardsByStatus(column.id).map((card) => (
                    <Card
                      key={card.id}
                      className="cursor-move hover:shadow-md transition-shadow"
                      draggable
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onClick={() => handleCardClick(card)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary flex-shrink-0" />
                          <h4 className="font-semibold text-sm line-clamp-1">
                            {card.nome}
                          </h4>
                        </div>

                        <div className="space-y-1.5 text-xs">
                          {card.profissao && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Briefcase className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{card.profissao}</span>
                            </div>
                          )}

                          {card.telefone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{card.telefone}</span>
                            </div>
                          )}

                          {card.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{card.email}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {getCardsByStatus(column.id).length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-6">
                      Nenhum card
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        ))}
      </div>

      <AgesKanbanCardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        card={selectedCard}
      />

      {/* Dialog para criar novo card */}
      <Dialog open={novoCardDialogOpen} onOpenChange={setNovoCardDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Card AGES</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={novoCard.nome}
                onChange={(e) => setNovoCard(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profissao">Profissão</Label>
              <Select
                value={novoCard.profissao}
                onValueChange={(value) => setNovoCard(prev => ({ ...prev, profissao: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {PROFISSOES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={novoCard.telefone}
                onChange={(e) => setNovoCard(prev => ({ ...prev, telefone: e.target.value }))}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={novoCard.email}
                onChange={(e) => setNovoCard(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoCardDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => createCardMutation.mutate(novoCard)}
              disabled={createCardMutation.isPending || !novoCard.nome.trim()}
            >
              {createCardMutation.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
