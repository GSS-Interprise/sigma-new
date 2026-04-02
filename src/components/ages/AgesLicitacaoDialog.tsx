import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useKanbanColumns } from "@/hooks/useKanbanColumns";

interface AgesLicitacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  licitacao: any;
}

const AgesLicitacaoDialog = ({ open, onOpenChange, licitacao }: AgesLicitacaoDialogProps) => {
  const queryClient = useQueryClient();
  const { data: columns = [] } = useKanbanColumns("ages_licitacoes");

  const [formData, setFormData] = useState({
    licitacao_id: "",
    status: "pregoes_ages",
    prazo_retorno_gss: "",
    prazo_licitacao: "",
    observacoes: "",
  });

  const { data: licitacoesDisponiveis = [] } = useQuery({
    queryKey: ["licitacoes-disponiveis-ages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licitacoes")
        .select("id, titulo, numero_edital")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: open && !licitacao,
  });

  useEffect(() => {
    if (licitacao) {
      setFormData({
        licitacao_id: licitacao.licitacao_id || "",
        status: licitacao.status || "pregoes_ages",
        prazo_retorno_gss: licitacao.prazo_retorno_gss || "",
        prazo_licitacao: licitacao.prazo_licitacao || "",
        observacoes: licitacao.observacoes || "",
      });
    } else {
      setFormData({
        licitacao_id: "",
        status: "pregoes_ages",
        prazo_retorno_gss: "",
        prazo_licitacao: "",
        observacoes: "",
      });
    }
  }, [licitacao, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        licitacao_id: formData.licitacao_id || null,
        status: formData.status,
        prazo_retorno_gss: formData.prazo_retorno_gss || null,
        prazo_licitacao: formData.prazo_licitacao || null,
        observacoes: formData.observacoes || null,
      };

      if (licitacao?.id) {
        const { error } = await supabase
          .from("ages_licitacoes")
          .update(payload)
          .eq("id", licitacao.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ages_licitacoes")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-licitacoes"] });
      toast.success(licitacao ? "Licitação atualizada" : "Licitação vinculada");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao salvar");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {licitacao ? "Editar Licitação AGES" : "Vincular Licitação"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!licitacao && (
            <div>
              <Label>Licitação</Label>
              <Select
                value={formData.licitacao_id}
                onValueChange={(v) => setFormData({ ...formData, licitacao_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma licitação" />
                </SelectTrigger>
                <SelectContent>
                  {licitacoesDisponiveis.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.numero_edital || l.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData({ ...formData, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prazo Retorno GSS</Label>
              <Input
                type="date"
                value={formData.prazo_retorno_gss}
                onChange={(e) => setFormData({ ...formData, prazo_retorno_gss: e.target.value })}
              />
            </div>
            <div>
              <Label>Prazo da Licitação</Label>
              <Input
                type="date"
                value={formData.prazo_licitacao}
                onChange={(e) => setFormData({ ...formData, prazo_licitacao: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgesLicitacaoDialog;
