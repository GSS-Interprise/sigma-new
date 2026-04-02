import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, GripVertical, Calendar, Edit, Trash2, AlertTriangle, Star, Play, Clock, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLUNAS_CONFIG = {
  urgente: { label: "Urgente", icon: AlertTriangle, color: "border-red-500 bg-red-50 dark:bg-red-950/20" },
  importante: { label: "Importante", icon: Star, color: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20" },
  em_andamento: { label: "Em Andamento", icon: Play, color: "border-blue-500 bg-blue-50 dark:bg-blue-950/20" },
  para_depois: { label: "Para Depois", icon: Clock, color: "border-gray-500 bg-gray-50 dark:bg-gray-950/20" },
  concluidas: { label: "Concluídas", icon: CheckCircle, color: "border-green-500 bg-green-50 dark:bg-green-950/20" },
};

interface Prioridade {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: string;
  ordem: number;
  tipo_relacionado: string | null;
  data_limite: string | null;
  created_at: string;
}

export function PrioridadesTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Prioridade | null>(null);
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    coluna: "para_depois",
    tipo_relacionado: "",
    data_limite: "",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-prioridades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_prioridades")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data as Prioridade[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const maxOrdem = items.filter(i => i.coluna === data.coluna).length;
      const { error } = await supabase.from("marketing_prioridades").insert({
        titulo: data.titulo,
        descricao: data.descricao || null,
        coluna: data.coluna,
        ordem: maxOrdem,
        tipo_relacionado: data.tipo_relacionado || null,
        data_limite: data.data_limite || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
      toast.success("Prioridade criada!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar prioridade"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_prioridades")
        .update({
          titulo: data.titulo,
          descricao: data.descricao || null,
          coluna: data.coluna,
          tipo_relacionado: data.tipo_relacionado || null,
          data_limite: data.data_limite || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
      toast.success("Prioridade atualizada!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar prioridade"),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, coluna }: { id: string; coluna: string }) => {
      const { error } = await supabase
        .from("marketing_prioridades")
        .update({ coluna })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
    },
    onError: () => toast.error("Erro ao mover prioridade"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_prioridades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-prioridades"] });
      toast.success("Prioridade excluída!");
    },
    onError: () => toast.error("Erro ao excluir prioridade"),
  });

  const resetForm = () => {
    setFormData({
      titulo: "",
      descricao: "",
      coluna: "para_depois",
      tipo_relacionado: "",
      data_limite: "",
    });
  };

  const handleEdit = (item: Prioridade) => {
    setEditingItem(item);
    setFormData({
      titulo: item.titulo,
      descricao: item.descricao || "",
      coluna: item.coluna,
      tipo_relacionado: item.tipo_relacionado || "",
      data_limite: item.data_limite || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.titulo) {
      toast.error("Informe o título");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: Prioridade) => {
    e.dataTransfer.setData("itemId", item.id);
  };

  const handleDrop = (e: React.DragEvent, coluna: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("itemId");
    if (itemId) {
      moveMutation.mutate({ id: itemId, coluna });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Prioridades da Semana</h2>
          <p className="text-sm text-muted-foreground">Organize suas tarefas de marketing por prioridade</p>
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
              <Plus className="h-4 w-4" /> Nova Prioridade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Prioridade" : "Nova Prioridade"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  placeholder="Título da tarefa"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Coluna</Label>
                  <Select value={formData.coluna} onValueChange={(v) => setFormData({ ...formData, coluna: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COLUNAS_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data Limite</Label>
                  <Input
                    type="date"
                    value={formData.data_limite}
                    onChange={(e) => setFormData({ ...formData, data_limite: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tipo Relacionado</Label>
                <Select value={formData.tipo_relacionado} onValueChange={(v) => setFormData({ ...formData, tipo_relacionado: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="campanha">Campanha</SelectItem>
                    <SelectItem value="conteudo">Conteúdo</SelectItem>
                    <SelectItem value="evento">Evento</SelectItem>
                    <SelectItem value="trafego">Tráfego Pago</SelectItem>
                    <SelectItem value="endomarketing">Endomarketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  placeholder="Descreva a tarefa..."
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                />
              </div>
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

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {Object.entries(COLUNAS_CONFIG).map(([colunaKey, colunaConfig]) => {
          const Icon = colunaConfig.icon;
          const colunaItems = items.filter((item) => item.coluna === colunaKey);

          return (
            <div
              key={colunaKey}
              className={`rounded-lg border-2 p-4 min-h-[400px] ${colunaConfig.color}`}
              onDrop={(e) => handleDrop(e, colunaKey)}
              onDragOver={handleDragOver}
            >
              <div className="flex items-center gap-2 mb-4">
                <Icon className="h-5 w-5" />
                <h3 className="font-semibold">{colunaConfig.label}</h3>
                <span className="ml-auto text-sm text-muted-foreground bg-background rounded-full px-2 py-0.5">
                  {colunaItems.length}
                </span>
              </div>

              <div className="space-y-3">
                {colunaItems.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.titulo}</p>
                          {item.descricao && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.descricao}</p>
                          )}
                          {item.data_limite && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-2">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(item.data_limite), "dd/MM", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(item)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => {
                              if (confirm("Excluir esta prioridade?")) {
                                deleteMutation.mutate(item.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
