import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface AgesLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: any;
}

const statusOptions = [
  { value: "novo", label: "Novo" },
  { value: "em_contato", label: "Em Contato" },
  { value: "convertido", label: "Convertido" },
  { value: "descartado", label: "Descartado" },
];

const ufOptions = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const AgesLeadDialog = ({ open, onOpenChange, lead }: AgesLeadDialogProps) => {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome: "",
    profissao: "",
    telefone: "",
    email: "",
    cidade: "",
    uf: "",
    origem: "",
    status: "novo",
    observacoes: "",
  });

  useEffect(() => {
    if (lead) {
      setFormData({
        nome: lead.nome || "",
        profissao: lead.profissao || "",
        telefone: lead.telefone || "",
        email: lead.email || "",
        cidade: lead.cidade || "",
        uf: lead.uf || "",
        origem: lead.origem || "",
        status: lead.status || "novo",
        observacoes: lead.observacoes || "",
      });
    } else {
      setFormData({
        nome: "",
        profissao: "",
        telefone: "",
        email: "",
        cidade: "",
        uf: "",
        origem: "",
        status: "novo",
        observacoes: "",
      });
    }
  }, [lead, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: formData.nome,
        profissao: formData.profissao || null,
        telefone: formData.telefone || null,
        email: formData.email || null,
        cidade: formData.cidade || null,
        uf: formData.uf || null,
        origem: formData.origem || null,
        status: formData.status,
        observacoes: formData.observacoes || null,
      };

      if (lead?.id) {
        const { error } = await supabase
          .from("ages_leads")
          .update(payload)
          .eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ages_leads")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-leads"] });
      toast.success(lead ? "Lead atualizado" : "Lead cadastrado");
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
            {lead ? "Editar Lead" : "Novo Lead"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            />
          </div>

          <div>
            <Label>Profissão</Label>
            <Input
              value={formData.profissao}
              onChange={(e) => setFormData({ ...formData, profissao: e.target.value })}
              placeholder="Ex: Fisioterapeuta, Enfermeiro..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Telefone</Label>
              <Input
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cidade</Label>
              <Input
                value={formData.cidade}
                onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
              />
            </div>
            <div>
              <Label>UF</Label>
              <Select
                value={formData.uf}
                onValueChange={(v) => setFormData({ ...formData, uf: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ufOptions.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Origem</Label>
              <Input
                value={formData.origem}
                onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                placeholder="Ex: Site, Indicação, Evento..."
              />
            </div>
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
                  {statusOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !formData.nome}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgesLeadDialog;
