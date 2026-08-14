import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDestructive } from "@/components/common/ConfirmDestructive";
import { CATEGORIAS_USO, CATEGORIA_USO_VALUES, type CategoriaUso } from "@/constants/categorias";
import { ChakraConnectCard } from "./ChakraConnectCard";

const chipSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  numero: z.string().trim().min(10, "Número inválido").max(20),
  provedor: z.string().trim().max(100).optional(),
  limite_diario: z.number().min(1).max(10000),
  status: z.enum(["ativo", "inativo"]),
  dono_id: z.string().uuid().nullable().optional(),
  categoria_uso: z
    .enum(CATEGORIA_USO_VALUES as [CategoriaUso, ...CategoriaUso[]])
    .nullable()
    .optional(),
  privado: z.boolean().optional(),
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
    dono_id: null,
    categoria_uso: null,
    privado: false,
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

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-operadores-chip"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, nome_completo, email")
        .order("nome_completo", { ascending: true });
      return (data || []) as Array<{ id: string; nome_completo: string | null; email: string | null }>;
    },
    staleTime: 60_000,
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
        dono_id: validated.dono_id ?? null,
        categoria_uso: validated.categoria_uso ?? null,
        privado: validated.privado ?? false,
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
      dono_id: null,
      categoria_uso: null,
      privado: false,
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
      dono_id: chip.dono_id ?? null,
      categoria_uso: chip.categoria_uso ?? null,
      privado: chip.privado ?? false,
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <ChakraConnectCard />
      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
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

              <div className="space-y-2">
                <Label htmlFor="dono">Dono / Operador responsável</Label>
                <Select
                  value={formData.dono_id ?? "__null"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, dono_id: value === "__null" ? null : value })
                  }
                >
                  <SelectTrigger id="dono">
                    <SelectValue placeholder="Sem dono atribuído" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__null">— Sem dono —</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome_completo || p.email || p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Quem é responsável por esse chip. Importante pra organizar quem fala por qual número.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria de uso</Label>
                <Select
                  value={formData.categoria_uso ?? "__null"}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      categoria_uso:
                        value === "__null"
                          ? null
                          : (value as ChipForm["categoria_uso"]),
                    })
                  }
                >
                  <SelectTrigger id="categoria">
                    <SelectValue placeholder="Selecionar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__null">— Não classificado —</SelectItem>
                    {CATEGORIAS_USO.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.categoria_uso && (
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIAS_USO.find((c) => c.value === formData.categoria_uso)?.desc}
                  </p>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                <Switch
                  id="privado"
                  checked={formData.privado ?? false}
                  onCheckedChange={(checked) => setFormData({ ...formData, privado: checked })}
                />
                <div className="space-y-1 leading-tight">
                  <Label htmlFor="privado" className="flex items-center gap-1.5 cursor-pointer">
                    <Lock className="h-3.5 w-3.5" />
                    Chip privado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Só o dono e admins enxergam esse chip e suas conversas. Use pra chips pessoais.
                  </p>
                </div>
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
              <TableHead>Dono</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Limite Diário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chips.map((chip: any) => {
              const dono = profiles.find((p) => p.id === chip.dono_id);
              const cat = CATEGORIAS_USO.find((c) => c.value === chip.categoria_uso);
              return (
                <TableRow key={chip.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {chip.privado && (
                        <Lock
                          className="h-3.5 w-3.5 text-amber-600"
                          aria-label="Chip privado"
                        />
                      )}
                      <span>{chip.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell>{chip.numero}</TableCell>
                  <TableCell>
                    {dono ? (
                      <span className="text-sm">{dono.nome_completo || dono.email}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem dono</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {cat ? (
                      <Badge variant="outline" className="text-xs">
                        {cat.label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{chip.limite_diario}</TableCell>
                  <TableCell>
                    <Badge variant={chip.status === "ativo" ? "default" : "secondary"}>
                      {chip.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(chip)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <ConfirmDestructive
                        title={`Apagar chip "${chip.nome}"?`}
                        description={
                          <>
                            Isso vai remover o chip do sistema. Campanhas que usam esse
                            chip vão parar de funcionar até serem reconfiguradas. Histórico
                            de conversas permanece.
                          </>
                        }
                        confirmLabel="Apagar chip"
                        requireType={chip.nome}
                        onConfirm={() => deleteMutation.mutate(chip.id)}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      </Card>
    </div>
  );
}
