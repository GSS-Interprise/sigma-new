import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AgesUnidadeDialog from "./AgesUnidadeDialog";

interface AgesUnidadesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: {
    id: string;
    nome_empresa: string;
  };
}

interface AgesUnidade {
  id: string;
  nome: string;
  codigo?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export function AgesUnidadesManager({ open, onOpenChange, cliente }: AgesUnidadesManagerProps) {
  const queryClient = useQueryClient();
  const [unidadeDialogOpen, setUnidadeDialogOpen] = useState(false);
  const [selectedUnidade, setSelectedUnidade] = useState<AgesUnidade | null>(null);

  const { data: unidades = [], isLoading } = useQuery({
    queryKey: ['ages-unidades', cliente.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ages_unidades')
        .select('*')
        .eq('cliente_id', cliente.id)
        .order('nome');
      if (error) throw error;
      return data as AgesUnidade[];
    },
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ages_unidades').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ages-unidades', cliente.id] });
      toast.success('Unidade removida');
    },
    onError: () => {
      toast.error('Erro ao remover unidade');
    },
  });

  const handleEdit = (unidade: AgesUnidade) => {
    setSelectedUnidade(unidade);
    setUnidadeDialogOpen(true);
  };

  const handleNew = () => {
    setSelectedUnidade(null);
    setUnidadeDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Unidades - {cliente.nome_empresa}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleNew} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Unidade
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : unidades.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma unidade cadastrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    unidades.map((unidade) => (
                      <TableRow key={unidade.id}>
                        <TableCell>{unidade.codigo || '-'}</TableCell>
                        <TableCell className="font-medium">{unidade.nome}</TableCell>
                        <TableCell>
                          {unidade.cidade ? `${unidade.cidade}${unidade.uf ? `/${unidade.uf}` : ''}` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(unidade)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm('Remover esta unidade?')) {
                                  deleteMutation.mutate(unidade.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <AgesUnidadeDialog
        open={unidadeDialogOpen}
        onOpenChange={setUnidadeDialogOpen}
        clienteId={cliente.id}
        unidade={selectedUnidade}
      />
    </>
  );
}

export default AgesUnidadesManager;
