import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CentroCustoDialog } from "./CentroCustoDialog";
import { SetorDialog } from "./SetorDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SetoresTab() {
  const queryClient = useQueryClient();
  const [centroCustoDialogOpen, setCentroCustoDialogOpen] = useState(false);
  const [setorDialogOpen, setSetorDialogOpen] = useState(false);
  const [selectedCentroCusto, setSelectedCentroCusto] = useState<any>(null);
  const [selectedSetor, setSelectedSetor] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'centro' | 'setor' } | null>(null);

  const { data: centrosCusto, isLoading: loadingCentros } = useQuery({
    queryKey: ["centros_custo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("centros_custo")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: setores, isLoading: loadingSetores } = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setores")
        .select(`
          *,
          centros_custo:centro_custo_id (
            nome
          )
        `)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const handleEditCentroCusto = (centro: any) => {
    setSelectedCentroCusto(centro);
    setCentroCustoDialogOpen(true);
  };

  const handleEditSetor = (setor: any) => {
    setSelectedSetor(setor);
    setSetorDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;

    try {
      const table = itemToDelete.type === 'centro' ? 'centros_custo' : 'setores';
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", itemToDelete.id);

      if (error) throw error;

      toast.success(
        itemToDelete.type === 'centro' 
          ? "Centro de custo excluído com sucesso!" 
          : "Setor excluído com sucesso!"
      );
      
      queryClient.invalidateQueries({ queryKey: [table] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir");
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const confirmDelete = (id: string, type: 'centro' | 'setor') => {
    setItemToDelete({ id, type });
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Tabs defaultValue="setores" className="w-full">
        <TabsList>
          <TabsTrigger value="setores">Setores</TabsTrigger>
          <TabsTrigger value="centros">Centros de Custo</TabsTrigger>
        </TabsList>

        <TabsContent value="setores" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Setores</CardTitle>
              <Button
                onClick={() => {
                  setSelectedSetor(null);
                  setSetorDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Setor
              </Button>
            </CardHeader>
            <CardContent>
              {loadingSetores ? (
                <p>Carregando...</p>
              ) : setores && setores.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Setor</TableHead>
                      <TableHead>Centro de Custo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setores.map((setor) => (
                      <TableRow key={setor.id}>
                        <TableCell className="font-medium">{setor.nome}</TableCell>
                        <TableCell>{setor.centros_custo?.nome}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditSetor(setor)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete(setor.id, 'setor')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum setor cadastrado. Clique em "Novo Setor" para começar.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centros" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Centros de Custo</CardTitle>
              <Button
                onClick={() => {
                  setSelectedCentroCusto(null);
                  setCentroCustoDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Centro de Custo
              </Button>
            </CardHeader>
            <CardContent>
              {loadingCentros ? (
                <p>Carregando...</p>
              ) : centrosCusto && centrosCusto.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código Interno</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {centrosCusto.map((centro) => (
                      <TableRow key={centro.id}>
                        <TableCell className="font-medium">{centro.nome}</TableCell>
                        <TableCell>{centro.codigo_interno || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditCentroCusto(centro)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete(centro.id, 'centro')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum centro de custo cadastrado.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CentroCustoDialog
        open={centroCustoDialogOpen}
        onOpenChange={(open) => {
          setCentroCustoDialogOpen(open);
          if (!open) setSelectedCentroCusto(null);
        }}
        centroCusto={selectedCentroCusto}
      />

      <SetorDialog
        open={setorDialogOpen}
        onOpenChange={(open) => {
          setSetorDialogOpen(open);
          if (!open) setSelectedSetor(null);
        }}
        setor={selectedSetor}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este{" "}
              {itemToDelete?.type === 'centro' ? "centro de custo" : "setor"}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
