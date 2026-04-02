import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog";
import { KanbanStatusDialog } from "./KanbanStatusDialog";
import { toast } from "sonner";
import { 
  Settings, 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical,
  ArrowUp,
  ArrowDown
} from "lucide-react";

interface KanbanStatusManagerProps {
  modulo: string;
}

export function KanbanStatusManager({ modulo }: KanbanStatusManagerProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<any>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['kanban-status-config', modulo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kanban_status_config')
        .select('*')
        .eq('modulo', modulo)
        .eq('ativo', true)
        .order('ordem');
      
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (statusId: string) => {
      // Check if there are licitacoes with this status
      const { data: licitacoes, error: checkError } = await supabase
        .from('licitacoes')
        .select('id')
        .eq('status', statusId as any)
        .limit(1);

      if (checkError) throw checkError;

      if (licitacoes && licitacoes.length > 0) {
        throw new Error('Não é possível excluir este status pois existem licitações associadas a ele');
      }

      // Soft delete: set ativo to false
      const { error } = await supabase
        .from('kanban_status_config')
        .update({ ativo: false })
        .eq('id', statusId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status excluído com sucesso');
      queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
      queryClient.invalidateQueries({ queryKey: ['kanban-columns', modulo] });
      setDeleteDialogOpen(false);
      setSelectedStatus(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir status');
    }
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ statusId, newOrdem }: { statusId: string; newOrdem: number }) => {
      const { error } = await supabase
        .from('kanban_status_config')
        .update({ ordem: newOrdem })
        .eq('id', statusId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
      queryClient.invalidateQueries({ queryKey: ['kanban-columns', modulo] });
    }
  });

  const handleMoveUp = async (status: any, index: number) => {
    if (index === 0 || !statuses) return;
    
    const prevStatus = statuses[index - 1];
    await Promise.all([
      reorderMutation.mutateAsync({ statusId: status.id, newOrdem: prevStatus.ordem }),
      reorderMutation.mutateAsync({ statusId: prevStatus.id, newOrdem: status.ordem })
    ]);
  };

  const handleMoveDown = async (status: any, index: number) => {
    if (!statuses || index === statuses.length - 1) return;
    
    const nextStatus = statuses[index + 1];
    await Promise.all([
      reorderMutation.mutateAsync({ statusId: status.id, newOrdem: nextStatus.ordem }),
      reorderMutation.mutateAsync({ statusId: nextStatus.id, newOrdem: status.ordem })
    ]);
  };

  const handleEdit = (status: any) => {
    setSelectedStatus(status);
    setDialogOpen(true);
  };

  const handleDelete = (status: any) => {
    setSelectedStatus(status);
    setDeleteDialogOpen(true);
  };

  const handleAddNew = () => {
    setSelectedStatus(null);
    setDialogOpen(true);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
    queryClient.invalidateQueries({ queryKey: ['kanban-columns', modulo] });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || !statuses || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const draggedStatus = statuses[draggedIndex];
    const targetStatus = statuses[dropIndex];

    // Swap the ordem values
    await Promise.all([
      reorderMutation.mutateAsync({ statusId: draggedStatus.id, newOrdem: targetStatus.ordem }),
      reorderMutation.mutateAsync({ statusId: targetStatus.id, newOrdem: draggedStatus.ordem })
    ]);

    setDraggedIndex(null);
    setDragOverIndex(null);
    toast.success('Ordem atualizada');
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Settings className="h-4 w-4" />
        Gerenciar Status
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Status do Kanban</DialogTitle>
            <DialogDescription>
              Adicione, edite ou remova status do quadro Kanban. As alterações serão aplicadas imediatamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Button onClick={handleAddNew} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Novo Status
            </Button>

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : statuses && statuses.length > 0 ? (
              <div className="space-y-2">
                {statuses.map((status, index) => (
                  <Card 
                    key={status.id} 
                    className={`p-4 transition-all cursor-move ${
                      draggedIndex === index ? 'opacity-50 scale-95' : ''
                    } ${
                      dragOverIndex === index && draggedIndex !== index 
                        ? 'border-primary border-2 bg-primary/5' 
                        : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      
                      <div
                        className="w-4 h-4 rounded-full border-2"
                        style={{ backgroundColor: status.cor || '#3b82f6' }}
                      />
                      
                      <div className="flex-1">
                        <div className="font-medium">{status.label}</div>
                        <div className="text-xs text-muted-foreground">
                          ID: {status.status_id}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          UUID: {status.id}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveUp(status, index)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMoveDown(status, index)}
                          disabled={index === statuses.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(status)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(status)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum status encontrado
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <KanbanStatusDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        modulo={modulo}
        status={selectedStatus}
        maxOrdem={statuses?.length || 0}
        onSuccess={handleSuccess}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o status "{selectedStatus?.label}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStatus && deleteStatusMutation.mutate(selectedStatus.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
