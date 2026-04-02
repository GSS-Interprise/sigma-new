import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

interface ExtractedData {
  nome_profissional?: string;
  cargo?: string;
  registro_profissional?: string;
  unidade?: string;
  mes_referencia?: number;
  ano_referencia?: number;
  total_horas?: number;
  observacoes?: string;
}

interface AgesProducaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  producao: any;
  extractedData?: ExtractedData | null;
}

const statusOptions = [
  { value: "pendente", label: "Pendente" },
  { value: "conferido", label: "Conferido" },
  { value: "aprovado", label: "Aprovado" },
];

const tipoAlocacaoOptions = [
  "Plantão",
  "Carga Horária Fixa",
  "Sob Demanda",
  "Escala",
  "Outro",
];

const mesesOptions = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString(),
  label: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][i],
}));

const currentYear = new Date().getFullYear();
const anosOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

const AgesProducaoDialog = ({ open, onOpenChange, producao, extractedData }: AgesProducaoDialogProps) => {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    profissional_id: "",
    ages_cliente_id: "",
    mes_referencia: (new Date().getMonth() + 1).toString(),
    ano_referencia: currentYear.toString(),
    total_horas: "",
    tipo_alocacao: "",
    status_conferencia: "pendente",
    observacoes: "",
  });

  const { data: profissionais = [] } = useQuery({
    queryKey: ["ages-profissionais-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_profissionais")
        .select("id, nome, registro_profissional")
        .order("nome");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["ages-clientes-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ages_clientes")
        .select("id, nome_empresa")
        .ilike("status_cliente", "ativo")
        .order("nome_empresa");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Auto-match profissional by name or registration from extracted data
  useEffect(() => {
    if (extractedData && profissionais.length > 0 && !producao) {
      const matchedProfissional = profissionais.find(p => {
        const nameMatch = extractedData.nome_profissional && 
          p.nome.toLowerCase().includes(extractedData.nome_profissional.toLowerCase());
        const regMatch = extractedData.registro_profissional && 
          p.registro_profissional?.includes(extractedData.registro_profissional);
        return nameMatch || regMatch;
      });

      setFormData(prev => ({
        ...prev,
        profissional_id: matchedProfissional?.id || "",
        mes_referencia: extractedData.mes_referencia?.toString() || prev.mes_referencia,
        ano_referencia: extractedData.ano_referencia?.toString() || prev.ano_referencia,
        total_horas: extractedData.total_horas?.toString() || prev.total_horas,
        observacoes: extractedData.observacoes || `Dados extraídos via IA - Profissional: ${extractedData.nome_profissional || "N/A"}, Cargo: ${extractedData.cargo || "N/A"}, Unidade: ${extractedData.unidade || "N/A"}`,
      }));
    }
  }, [extractedData, profissionais, producao]);

  useEffect(() => {
    if (producao) {
      setFormData({
        profissional_id: producao.profissional_id || "",
        ages_cliente_id: producao.ages_cliente_id || "",
        mes_referencia: producao.mes_referencia?.toString() || (new Date().getMonth() + 1).toString(),
        ano_referencia: producao.ano_referencia?.toString() || currentYear.toString(),
        total_horas: producao.total_horas?.toString() || "",
        tipo_alocacao: producao.tipo_alocacao || "",
        status_conferencia: producao.status_conferencia || "pendente",
        observacoes: producao.observacoes || "",
      });
    } else if (!extractedData) {
      setFormData({
        profissional_id: "",
        ages_cliente_id: "",
        mes_referencia: (new Date().getMonth() + 1).toString(),
        ano_referencia: currentYear.toString(),
        total_horas: "",
        tipo_alocacao: "",
        status_conferencia: "pendente",
        observacoes: "",
      });
    }
  }, [producao, open, extractedData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        profissional_id: formData.profissional_id,
        ages_cliente_id: formData.ages_cliente_id || null,
        // Keep cliente_id null for new records using ages_clientes
        cliente_id: producao?.cliente_id || null,
        mes_referencia: parseInt(formData.mes_referencia),
        ano_referencia: parseInt(formData.ano_referencia),
        total_horas: parseFloat(formData.total_horas) || 0,
        tipo_alocacao: formData.tipo_alocacao || null,
        status_conferencia: formData.status_conferencia,
        observacoes: formData.observacoes || null,
      };

      if (producao?.id) {
        const { error } = await supabase
          .from("ages_producao")
          .update(payload)
          .eq("id", producao.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ages_producao")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ages-producao"] });
      toast.success(producao ? "Registro atualizado" : "Registro criado");
      onOpenChange(false);
    },
    onError: (error: any) => {
      if (error.message?.includes("duplicate")) {
        toast.error("Já existe um registro para este profissional/cliente/mês");
      } else {
        toast.error("Erro ao salvar");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {producao ? "Editar Produção" : "Nova Produção"}
            {extractedData && (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Dados via IA
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {extractedData && (
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1 border">
            <p className="font-medium text-muted-foreground">Dados extraídos da folha de ponto:</p>
            <p><span className="text-muted-foreground">Profissional:</span> {extractedData.nome_profissional || "-"}</p>
            <p><span className="text-muted-foreground">Cargo:</span> {extractedData.cargo || "-"}</p>
            <p><span className="text-muted-foreground">Registro:</span> {extractedData.registro_profissional || "-"}</p>
            <p><span className="text-muted-foreground">Unidade:</span> {extractedData.unidade || "-"}</p>
            <p><span className="text-muted-foreground">Período:</span> {mesesOptions[Number(extractedData.mes_referencia || 0) - 1]?.label || "-"}/{extractedData.ano_referencia || "-"}</p>
            <p><span className="text-muted-foreground">Total Horas:</span> {extractedData.total_horas || 0}h</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>Profissional *</Label>
            <Select
              value={formData.profissional_id}
              onValueChange={(v) => setFormData({ ...formData, profissional_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {profissionais.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cliente AGES *</Label>
            <Select
              value={formData.ages_cliente_id}
              onValueChange={(v) => setFormData({ ...formData, ages_cliente_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_empresa}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mês *</Label>
              <Select
                value={formData.mes_referencia}
                onValueChange={(v) => setFormData({ ...formData, mes_referencia: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mesesOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ano *</Label>
              <Select
                value={formData.ano_referencia}
                onValueChange={(v) => setFormData({ ...formData, ano_referencia: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anosOptions.map((a) => (
                    <SelectItem key={a} value={a.toString()}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Total de Horas *</Label>
              <Input
                type="number"
                step="0.5"
                value={formData.total_horas}
                onChange={(e) => setFormData({ ...formData, total_horas: e.target.value })}
              />
            </div>

            <div>
              <Label>Tipo de Alocação</Label>
              <Select
                value={formData.tipo_alocacao}
                onValueChange={(v) => setFormData({ ...formData, tipo_alocacao: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {tipoAlocacaoOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Status de Conferência</Label>
            <Select
              value={formData.status_conferencia}
              onValueChange={(v) => setFormData({ ...formData, status_conferencia: v })}
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

          <div>
            <Label>Observações</Label>
            <Textarea
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !formData.profissional_id ||
                !formData.total_horas
              }
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgesProducaoDialog;
