import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UnidadeDialog } from "./UnidadeDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface UnidadesTabProps {
  clienteId: string;
  clienteNome: string;
}

export function UnidadesTab({ clienteId, clienteNome }: UnidadesTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnidade, setEditingUnidade] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: unidades, isLoading } = useQuery({
    queryKey: ['unidades', clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unidades')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('nome');
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('unidades')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unidades'] });
      toast.success('Unidade excluída com sucesso');
    },
    onError: () => {
      toast.error('Erro ao excluir unidade');
    },
  });

  const handleEdit = (unidade: any) => {
    setEditingUnidade(unidade);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta unidade?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingUnidade(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Unidades de {clienteNome}</CardTitle>
            <CardDescription>
              Gerencie as unidades/filiais deste cliente
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Unidade
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p>Carregando...</p>
        ) : !unidades || unidades.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma unidade cadastrada</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unidades.map((unidade) => (
                <TableRow key={unidade.id}>
                  <TableCell>{unidade.codigo || '-'}</TableCell>
                  <TableCell>{unidade.nome}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(unidade)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(unidade.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UnidadeDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        clienteId={clienteId}
        unidade={editingUnidade}
      />
    </Card>
  );
}