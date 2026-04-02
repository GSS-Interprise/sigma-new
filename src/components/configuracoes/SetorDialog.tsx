import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface SetorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setor?: any;
}

export function SetorDialog({
  open,
  onOpenChange,
  setor,
}: SetorDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    centro_custo_id: "",
  });

  const { data: centrosCusto } = useQuery({
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

  useEffect(() => {
    if (setor) {
      setFormData({
        nome: setor.nome || "",
        centro_custo_id: setor.centro_custo_id || "",
      });
    } else {
      setFormData({
        nome: "",
        centro_custo_id: "",
      });
    }
  }, [setor, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (setor) {
        const { error } = await supabase
          .from("setores")
          .update({
            nome: formData.nome,
            centro_custo_id: formData.centro_custo_id,
          })
          .eq("id", setor.id);

        if (error) throw error;
        toast.success("Setor atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("setores")
          .insert({
            nome: formData.nome,
            centro_custo_id: formData.centro_custo_id,
          });

        if (error) throw error;
        toast.success("Setor criado com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["setores"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar setor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {setor ? "Editar Setor" : "Novo Setor"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Setor</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) =>
                setFormData({ ...formData, nome: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="centro_custo">Centro de Custo</Label>
            <Select
              value={formData.centro_custo_id}
              onValueChange={(value) =>
                setFormData({ ...formData, centro_custo_id: value })
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um centro de custo" />
              </SelectTrigger>
              <SelectContent>
                {centrosCusto?.map((centro) => (
                  <SelectItem key={centro.id} value={centro.id}>
                    {centro.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
