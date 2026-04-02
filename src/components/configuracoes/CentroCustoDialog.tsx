import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";

interface CentroCustoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centroCusto?: any;
}

export function CentroCustoDialog({
  open,
  onOpenChange,
  centroCusto,
}: CentroCustoDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    codigo_interno: "",
  });

  useEffect(() => {
    if (centroCusto) {
      setFormData({
        nome: centroCusto.nome || "",
        codigo_interno: centroCusto.codigo_interno || "",
      });
    } else {
      setFormData({
        nome: "",
        codigo_interno: "",
      });
    }
  }, [centroCusto, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (centroCusto) {
        const { error } = await supabase
          .from("centros_custo")
          .update({
            nome: formData.nome,
            codigo_interno: formData.codigo_interno || null,
          })
          .eq("id", centroCusto.id);

        if (error) throw error;
        toast.success("Centro de custo atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("centros_custo")
          .insert({
            nome: formData.nome,
            codigo_interno: formData.codigo_interno || null,
          });

        if (error) throw error;
        toast.success("Centro de custo criado com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar centro de custo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {centroCusto ? "Editar Centro de Custo" : "Novo Centro de Custo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Centro de Custo</Label>
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
            <Label htmlFor="codigo_interno">Código Interno (opcional)</Label>
            <Input
              id="codigo_interno"
              value={formData.codigo_interno}
              onChange={(e) =>
                setFormData({ ...formData, codigo_interno: e.target.value })
              }
            />
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
