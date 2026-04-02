import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLUNAS = [
  { id: "urgente", label: "Urgente", color: "bg-red-100 border-red-300 dark:bg-red-900/20" },
  { id: "importante", label: "Importante", color: "bg-yellow-100 border-yellow-300 dark:bg-yellow-900/20" },
  { id: "em_andamento", label: "Em Andamento", color: "bg-blue-100 border-blue-300 dark:bg-blue-900/20" },
  { id: "para_depois", label: "Para Depois", color: "bg-gray-100 border-gray-300 dark:bg-gray-900/20" },
];

interface Prioridade {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: string;
  ordem: number;
  created_at: string;
}

const defaultForm = {
  titulo: "",
  descricao: "",
  coluna: "urgente",
};

export function PrioridadesKanbanTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState(defaultForm);
  const [draggedItem, setDraggedItem] = useState<Prioridade | null>(null);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["marketing-prioridades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_prioridades")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as Prioridade[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const maxOrdem = items?.filter((i) => i.coluna === data.coluna).length || 0;
      const { error } = await supabase.from("marketing_prioridades").insert({
        titulo: data.titulo,
        descricao: data.descricao || null,
        coluna: data.coluna,
        ordem: maxOrdem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
      toast.success("Card adicionado!");
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, coluna, ordem }: { id: string; coluna: string; ordem: number }) => {
      const { error } = await supabase
        .from("marketing_prioridades")
        .update({ coluna, ordem })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_prioridades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
      toast.success("Card excluído!");
    },
  });

  const resetForm = () => {
    setFormData(defaultForm);
    setIsDialogOpen(false);
  };

  const handleSubmit = () => {
    if (!formData.titulo) {
      toast.error("Preencha o título");
      return;
    }
    createMutation.mutate(formData);
  };

  const handleDragStart = (e: React.DragEvent, item: Prioridade) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetColuna: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem.coluna !== targetColuna) {
      const itemsInTargetColuna = items?.filter((i) => i.coluna === targetColuna).length || 0;
      updateMutation.mutate({
        id: draggedItem.id,
        coluna: targetColuna,
        ordem: itemsInTargetColuna,
      });
    }
    setDraggedItem(null);
  };

  const getItemsByColuna = (colunaId: string) => {
    return items?.filter((item) => item.coluna === colunaId) || [];
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Prioridades da Semana</h2>
          <p className="text-sm text-muted-foreground">Organize suas tarefas por prioridade</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData(defaultForm)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Card
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Card</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="O que precisa ser feito?"
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Detalhes..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Coluna</Label>
                <div className="grid grid-cols-2 gap-2">
                  {COLUNAS.map((col) => (
                    <Button
                      key={col.id}
                      type="button"
                      variant={formData.coluna === col.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormData({ ...formData, coluna: col.id })}
                    >
                      {col.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full">
                Adicionar Card
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUNAS.map((coluna) => (
            <div
              key={coluna.id}
              className={`p-3 rounded-lg border-2 min-h-[300px] ${coluna.color}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, coluna.id)}
            >
              <h3 className="font-semibold mb-3 text-center">{coluna.label}</h3>
              <div className="space-y-2">
                {getItemsByColuna(coluna.id).map((item) => (
                  <Card
                    key={item.id}
                    className="p-3 cursor-move hover:shadow-md transition-shadow"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.titulo}</p>
                        {item.descricao && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.descricao}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (confirm("Excluir este card?")) deleteMutation.mutate(item.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {getItemsByColuna(coluna.id).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Arraste cards aqui
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
