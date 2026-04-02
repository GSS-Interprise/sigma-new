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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface LeadStatusManagerProps {
  modulo?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface StatusConfig {
  id: string;
  status_id: string;
  label: string;
  cor: string | null;
  ordem: number;
  modulo: string;
  ativo: boolean;
}

export function LeadStatusManager({ modulo = 'disparos', open: controlledOpen, onOpenChange }: LeadStatusManagerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<StatusConfig | null>(null);
  const [label, setLabel] = useState("");
  const [statusId, setStatusId] = useState("");
  const [cor, setCor] = useState("#3b82f6");
  const [loading, setLoading] = useState(false);
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
      return data as StatusConfig[];
    },
    enabled: open
  });

  const createStatusMutation = useMutation({
    mutationFn: async ({ statusId, label, cor, ordem }: { statusId: string; label: string; cor: string; ordem: number }) => {
      // Insert into kanban_status_config
      const { error } = await supabase
        .from('kanban_status_config')
        .insert({
          modulo: modulo,
          status_id: statusId,
          label: label,
          cor: cor,
          ordem: ordem,
          ativo: true
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error("Já existe um status com este ID");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Status criado com sucesso. Lembre-se de atualizar a constraint no banco de dados se necessário.");
      queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar status");
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, label, cor }: { id: string; label: string; cor: string }) => {
      const { error } = await supabase
        .from('kanban_status_config')
        .update({
          label: label,
          cor: cor,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar status");
    }
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (statusId: string) => {
      // Check if there are leads with this status
      const { data: leads, error: checkError } = await supabase
        .from('leads')
        .select('id')
        .eq('status', selectedStatus?.label || '')
        .limit(1);

      if (checkError) throw checkError;

      if (leads && leads.length > 0) {
        throw new Error('Não é possível excluir este status pois existem leads associados a ele');
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
      setDeleteDialogOpen(false);
      setSelectedStatus(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao excluir status');
    }
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, newOrdem }: { id: string; newOrdem: number }) => {
      const { error } = await supabase
        .from('kanban_status_config')
        .update({ ordem: newOrdem })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban-status-config', modulo] });
    }
  });

  const resetForm = () => {
    setLabel("");
    setStatusId("");
    setCor("#3b82f6");
    setSelectedStatus(null);
  };

  const generateStatusId = (text: string) => {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (!selectedStatus) {
      setStatusId(generateStatusId(value));
    }
  };

  const handleMoveUp = async (status: StatusConfig, index: number) => {
    if (index === 0 || !statuses) return;
    
    const prevStatus = statuses[index - 1];
    await Promise.all([
      reorderMutation.mutateAsync({ id: status.id, newOrdem: prevStatus.ordem }),
      reorderMutation.mutateAsync({ id: prevStatus.id, newOrdem: status.ordem })
    ]);
  };

  const handleMoveDown = async (status: StatusConfig, index: number) => {
    if (!statuses || index === statuses.length - 1) return;
    
    const nextStatus = statuses[index + 1];
    await Promise.all([
      reorderMutation.mutateAsync({ id: status.id, newOrdem: nextStatus.ordem }),
      reorderMutation.mutateAsync({ id: nextStatus.id, newOrdem: status.ordem })
    ]);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || !statuses || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newStatuses = [...statuses];
    const [draggedItem] = newStatuses.splice(draggedIndex, 1);
    newStatuses.splice(dropIndex, 0, draggedItem);

    // Update all ordem values
    const updates = newStatuses.map((status, index) => 
      reorderMutation.mutateAsync({ id: status.id, newOrdem: index + 1 })
    );

    await Promise.all(updates);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleEdit = (status: StatusConfig) => {
    setSelectedStatus(status);
    setLabel(status.label);
    setStatusId(status.status_id);
    setCor(status.cor || "#3b82f6");
    setDialogOpen(true);
  };

  const handleDelete = (status: StatusConfig) => {
    setSelectedStatus(status);
    setDeleteDialogOpen(true);
  };

  const handleAddNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!label.trim() || !statusId.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);

    try {
      if (selectedStatus) {
        await updateStatusMutation.mutateAsync({
          id: selectedStatus.id,
          label: label.trim(),
          cor: cor
        });
      } else {
        await createStatusMutation.mutateAsync({
          statusId: statusId.trim(),
          label: label.trim(),
          cor: cor,
          ordem: (statuses?.length || 0) + 1
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!isControlled && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Gerenciar Status
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Status de Leads</DialogTitle>
            <DialogDescription>
              Configure os status disponíveis para leads no funil de captação. As alterações são sincronizadas com o sistema.
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
                    className={`p-4 transition-all ${
                      draggedIndex === index ? 'opacity-50 scale-95' : ''
                    } ${
                      dragOverIndex === index ? 'border-primary border-2' : ''
                    }`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, index)}
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
                Nenhum status configurado. Clique em "Adicionar Novo Status" para começar.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para criar/editar status */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {selectedStatus ? 'Editar Status' : 'Novo Status'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="label">Nome do Status *</Label>
                <Input
                  id="label"
                  value={label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Ex: Em Negociação"
                  maxLength={50}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status_id">ID do Status *</Label>
                <Input
                  id="status_id"
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  placeholder="Ex: Em Negociação"
                  disabled={!!selectedStatus}
                  required
                />
                {!selectedStatus && (
                  <p className="text-xs text-muted-foreground">
                    Este é o valor que será usado na tabela de leads
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor">Cor</Label>
                <div className="flex gap-2">
                  <Input
                    id="cor"
                    type="color"
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
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
