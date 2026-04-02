import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface KanbanStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modulo: string;
  status?: {
    id: string;
    status_id: string;
    label: string;
    cor?: string;
    ordem: number;
  } | null;
  maxOrdem: number;
  onSuccess: () => void;
}

export function KanbanStatusDialog({ 
  open, 
  onOpenChange, 
  modulo, 
  status, 
  maxOrdem,
  onSuccess 
}: KanbanStatusDialogProps) {
  const [label, setLabel] = useState("");
  const [statusId, setStatusId] = useState("");
  const [cor, setCor] = useState("#3b82f6");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status) {
      setLabel(status.label);
      setStatusId(status.status_id);
      setCor(status.cor || "#3b82f6");
    } else {
      setLabel("");
      setStatusId("");
      setCor("#3b82f6");
    }
  }, [status, open]);

  const generateStatusId = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (!status) {
      setStatusId(generateStatusId(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!label.trim() || !statusId.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setLoading(true);

    try {
      if (status) {
        // Update existing status
        const { error } = await supabase
          .from('kanban_status_config')
          .update({
            label: label.trim(),
            cor: cor,
            updated_at: new Date().toISOString()
          })
          .eq('id', status.id);

        if (error) throw error;
        toast.success("Status atualizado com sucesso");
      } else {
        // Create new status
        const { error } = await supabase
          .from('kanban_status_config')
          .insert({
            modulo,
            status_id: statusId.trim(),
            label: label.trim(),
            cor: cor,
            ordem: maxOrdem + 1,
            ativo: true
          });

        if (error) {
          if (error.code === '23505') {
            toast.error("Já existe um status com este ID");
            return;
          }
          throw error;
        }
        toast.success("Status criado com sucesso");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving status:', error);
      toast.error(error.message || "Erro ao salvar status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {status ? 'Editar Status' : 'Novo Status'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="label">Nome do Status *</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder="Ex: Em análise"
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
                placeholder="Ex: em_analise"
                disabled={!!status}
                required
              />
              {!status && (
                <p className="text-xs text-muted-foreground">
                  Gerado automaticamente, mas pode ser editado
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
              onClick={() => onOpenChange(false)}
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
  );
}
