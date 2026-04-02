import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, Target, FileText, Edit, Trash2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  em_planejamento: { label: "Em Planejamento", variant: "secondary" as const },
  em_execucao: { label: "Em Execução", variant: "default" as const },
  finalizado: { label: "Finalizado", variant: "outline" as const },
};

interface Tarefa {
  id: string;
  texto: string;
  concluido: boolean;
}

interface Planejamento {
  id: string;
  campanha_id: string | null;
  objetivo: string;
  publico: string | null;
  materiais_necessarios: string[] | null;
  cronograma: any[] | null;
  tarefas: any;
  relatorio_final: string | null;
  status: string;
  created_at: string;
}

export function PlanejamentoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Planejamento | null>(null);
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    objetivo: "",
    publico: "",
    materiais_necessarios: "",
    status: "em_planejamento",
    relatorio_final: "",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-planejamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_planejamentos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Planejamento[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_planejamentos").insert({
        objetivo: data.objetivo,
        publico: data.publico || null,
        materiais_necessarios: data.materiais_necessarios ? data.materiais_necessarios.split(",").map(s => s.trim()) : null,
        status: data.status,
        relatorio_final: data.relatorio_final || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] });
      toast.success("Planejamento criado!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar planejamento"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_planejamentos")
        .update({
          objetivo: data.objetivo,
          publico: data.publico || null,
          materiais_necessarios: data.materiais_necessarios ? data.materiais_necessarios.split(",").map(s => s.trim()) : null,
          status: data.status,
          relatorio_final: data.relatorio_final || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] });
      toast.success("Planejamento atualizado!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar planejamento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_planejamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] });
      toast.success("Planejamento excluído!");
    },
    onError: () => toast.error("Erro ao excluir planejamento"),
  });

  const resetForm = () => {
    setFormData({
      objetivo: "",
      publico: "",
      materiais_necessarios: "",
      status: "em_planejamento",
      relatorio_final: "",
    });
  };

  const handleEdit = (item: Planejamento) => {
    setEditingItem(item);
    setFormData({
      objetivo: item.objetivo,
      publico: item.publico || "",
      materiais_necessarios: item.materiais_necessarios?.join(", ") || "",
      status: item.status,
      relatorio_final: item.relatorio_final || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.objetivo) {
      toast.error("Informe o objetivo");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.objetivo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Planejamento</h2>
          <p className="text-sm text-muted-foreground">Planejamento macro de campanhas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Novo Planejamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Planejamento" : "Novo Planejamento"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Objetivo *</Label>
                <Textarea
                  placeholder="Objetivo do planejamento..."
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Público</Label>
                <Input
                  placeholder="Público-alvo"
                  value={formData.publico}
                  onChange={(e) => setFormData({ ...formData, publico: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Materiais Necessários (separados por vírgula)</Label>
                <Input
                  placeholder="Ex: Banner, Vídeo, Email template"
                  value={formData.materiais_necessarios}
                  onChange={(e) => setFormData({ ...formData, materiais_necessarios: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.status === "finalizado" && (
                <div className="space-y-2">
                  <Label>Relatório Final</Label>
                  <Textarea
                    placeholder="Relatório final do planejamento..."
                    rows={4}
                    value={formData.relatorio_final}
                    onChange={(e) => setFormData({ ...formData, relatorio_final: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar planejamentos..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum planejamento encontrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.em_planejamento;
            const tarefasConcluidas = item.tarefas?.filter(t => t.concluido).length || 0;
            const tarefasTotal = item.tarefas?.length || 0;

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm font-medium line-clamp-1">{item.objetivo}</CardTitle>
                    </div>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.publico && (
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Público:</span> {item.publico}
                    </p>
                  )}
                  {item.materiais_necessarios && item.materiais_necessarios.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.materiais_necessarios.slice(0, 3).map((mat, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{mat}</Badge>
                      ))}
                      {item.materiais_necessarios.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{item.materiais_necessarios.length - 3}</Badge>
                      )}
                    </div>
                  )}
                  {tarefasTotal > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      <span>{tarefasConcluidas}/{tarefasTotal} tarefas</span>
                    </div>
                  )}
                  {item.relatorio_final && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <FileText className="h-4 w-4" />
                      <span>Relatório disponível</span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(item.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Excluir este planejamento?")) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
