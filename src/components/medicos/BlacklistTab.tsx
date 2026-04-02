import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Trash2, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatPhoneForDisplay } from "@/lib/phoneUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function BlacklistTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMedico, setSelectedMedico] = useState("");
  const [reason, setReason] = useState("");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  const { data: blacklist, isLoading } = useQuery({
    queryKey: ['blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blacklist')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: medicos } = useQuery({
    queryKey: ['medicos-for-blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('medicos')
        .select('id, nome_completo, phone_e164')
        .not('phone_e164', 'is', null)
        .order('nome_completo');
      
      if (error) throw error;
      return data;
    },
  });

  const addToBlacklistMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMedico || !reason) {
        throw new Error('Selecione um médico e informe o motivo');
      }

      const medico = medicos?.find(m => m.id === selectedMedico);
      if (!medico) throw new Error('Médico não encontrado');

      const { error } = await supabase
        .from('blacklist')
        .insert({
          phone_e164: medico.phone_e164,
          nome: medico.nome_completo,
          origem: 'clinico',
          reason,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Médico adicionado à blacklist');
      setDialogOpen(false);
      setSelectedMedico("");
      setReason("");
      setIsEditing(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao adicionar à blacklist');
    },
  });

  const updateBlacklistMutation = useMutation({
    mutationFn: async () => {
      if (!reason) {
        throw new Error('Informe o motivo');
      }

      const { error } = await supabase
        .from('blacklist')
        .update({ reason })
        .eq('id', editingItem.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Registro atualizado com sucesso');
      setDialogOpen(false);
      setReason("");
      setIsEditing(false);
      setEditingItem(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar registro');
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blacklist')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
      toast.success('Removido da blacklist com sucesso');
    },
    onError: () => {
      toast.error('Erro ao remover da blacklist');
    },
  });

  const filteredBlacklist = useMemo(() => {
    if (!blacklist) return [];
    
    return blacklist.filter((item) =>
      item.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.phone_e164?.includes(searchTerm) ||
      item.reason?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [blacklist, searchTerm]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone ou motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Button onClick={() => {
          setIsEditing(false);
          setEditingItem(null);
          setSelectedMedico("");
          setReason("");
          setDialogOpen(true);
        }}>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar à Blacklist
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Telefone</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredBlacklist.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">
                  Nenhum registro na blacklist
                </TableCell>
              </TableRow>
            ) : (
              filteredBlacklist.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {formatPhoneForDisplay(item.phone_e164)}
                  </TableCell>
                  <TableCell>{item.nome || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={item.origem === 'lead' ? 'secondary' : 'default'}>
                      {item.origem}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {item.reason || '-'}
                  </TableCell>
                  <TableCell>
                    {format(new Date(item.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditing(true);
                          setEditingItem(item);
                          setReason(item.reason || "");
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Tem certeza que deseja remover da blacklist?')) {
                            removeMutation.mutate(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar Registro da Blacklist' : 'Adicionar Médico à Blacklist'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!isEditing && (
              <div className="space-y-2">
                <Label>Médico</Label>
                <Select value={selectedMedico} onValueChange={setSelectedMedico}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um médico" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicos?.map((medico) => (
                      <SelectItem key={medico.id} value={medico.id}>
                        {medico.nome_completo} - {formatPhoneForDisplay(medico.phone_e164)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isEditing && (
              <div className="space-y-2">
                <Label>Médico</Label>
                <Input value={editingItem?.nome || '-'} disabled />
              </div>
            )}
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Textarea
                placeholder="Descreva o motivo para adicionar à blacklist..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setSelectedMedico("");
                  setReason("");
                  setIsEditing(false);
                  setEditingItem(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => isEditing ? updateBlacklistMutation.mutate() : addToBlacklistMutation.mutate()}
                disabled={
                  isEditing 
                    ? !reason || updateBlacklistMutation.isPending
                    : !selectedMedico || !reason || addToBlacklistMutation.isPending
                }
              >
                {isEditing 
                  ? (updateBlacklistMutation.isPending ? 'Salvando...' : 'Salvar')
                  : (addToBlacklistMutation.isPending ? 'Adicionando...' : 'Adicionar')
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
