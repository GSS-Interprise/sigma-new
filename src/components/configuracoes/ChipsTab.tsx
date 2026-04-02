import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const chipSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  numero: z.string().trim().min(10, "Número inválido").max(20),
  provedor: z.string().trim().max(100).optional(),
  limite_diario: z.number().min(1).max(10000),
  status: z.enum(["ativo", "inativo"]),
});

type ChipForm = z.infer<typeof chipSchema>;

export function ChipsTab() {
  const [open, setOpen] = useState(false);
  const [editingChip, setEditingChip] = useState<any>(null);
  const [formData, setFormData] = useState<ChipForm>({
    nome: "",
    numero: "",
    provedor: "",
    limite_diario: 1000,
    status: "ativo",
  });
  const queryClient = useQueryClient();

  const { data: chips = [], isLoading } = useQuery({
    queryKey: ["chips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ChipForm) => {
      const validated = chipSchema.parse(data);
      
      const chipData = {
        nome: validated.nome,
        numero: validated.numero,
        provedor: validated.provedor || null,
        limite_diario: validated.limite_diario,
        status: validated.status,
      };
      
      if (editingChip) {
        const { error } = await supabase
          .from("chips")
          .update(chipData)
          .eq("id", editingChip.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chips").insert([chipData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chips"] });
      toast.success(editingChip ? "Chip atualizado!" : "Chip adicionado!");
      setOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar chip");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chips"] });
      toast.success("Chip removido!");
    },
    onError: () => {
      toast.error("Erro ao remover chip");
    },
  });

  const resetForm = () => {
    setFormData({
      nome: "",
      numero: "",
      provedor: "",
      limite_diario: 1000,
      status: "ativo",
    });
    setEditingChip(null);
  };

  const handleEdit = (chip: any) => {
    setEditingChip(chip);
    setFormData({
      nome: chip.nome,
      numero: chip.numero,
      provedor: chip.provedor || "",
      limite_diario: chip.limite_diario,
      status: chip.status,
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <Card className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Gerenciamento de Chips</h2>
          <p className="text-muted-foreground">Configure os chips para envio de disparos</p>
        </div>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Chip
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingChip ? "Editar Chip" : "Adicionar Chip"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Chip *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Chip Principal"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="numero">Número *</Label>
                <Input
                  id="numero"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder="Ex: +5511999999999"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provedor">Provedor</Label>
                <Input
                  id="provedor"
                  value={formData.provedor}
                  onChange={(e) => setFormData({ ...formData, provedor: e.target.value })}
                  placeholder="Ex: Vivo, Claro, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="limite">Limite Diário *</Label>
                <Input
                  id="limite"
                  type="number"
                  min="1"
                  max="10000"
                  value={formData.limite_diario}
                  onChange={(e) => setFormData({ ...formData, limite_diario: Number(e.target.value) })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: "ativo" | "inativo") => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p>Carregando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Provedor</TableHead>
              <TableHead>Limite Diário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chips.map((chip) => (
              <TableRow key={chip.id}>
                <TableCell className="font-medium">{chip.nome}</TableCell>
                <TableCell>{chip.numero}</TableCell>
                <TableCell>{chip.provedor || "-"}</TableCell>
                <TableCell>{chip.limite_diario}</TableCell>
                <TableCell>
                  <Badge variant={chip.status === "ativo" ? "default" : "secondary"}>
                    {chip.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(chip)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(chip.id)}
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
    </Card>
  );
}
