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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Search, MapPin, Calendar, Users, Edit, Trash2, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Json } from "@/integrations/supabase/types";

const STATUS_CONFIG = {
  planejando: { label: "Planejando", variant: "secondary" as const },
  executando: { label: "Executando", variant: "default" as const },
  finalizado: { label: "Finalizado", variant: "outline" as const },
};

interface ChecklistItem {
  id: string;
  texto: string;
  concluido: boolean;
}

interface Evento {
  id: string;
  nome: string;
  data_inicio: string;
  data_fim: string | null;
  local: string | null;
  objetivo: string | null;
  tipo_evento: string | null;
  status: string;
  checklist_pre: any;
  checklist_durante: any;
  checklist_pos: any;
  created_at: string;
}

export function EventosMarketingTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Evento | null>(null);
  const [activeChecklistTab, setActiveChecklistTab] = useState("pre");
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome: "",
    data_inicio: "",
    data_fim: "",
    local: "",
    objetivo: "",
    tipo_evento: "",
    status: "planejando",
    checklist_pre: [] as ChecklistItem[],
    checklist_durante: [] as ChecklistItem[],
    checklist_pos: [] as ChecklistItem[],
  });

  const [newChecklistItem, setNewChecklistItem] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-eventos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_eventos")
        .select("*")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data as Evento[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_eventos").insert({
        nome: data.nome,
        data_inicio: data.data_inicio,
        data_fim: data.data_fim || null,
        local: data.local || null,
        objetivo: data.objetivo || null,
        tipo_evento: data.tipo_evento || null,
        status: data.status,
        checklist_pre: data.checklist_pre as unknown as Json,
        checklist_durante: data.checklist_durante as unknown as Json,
        checklist_pos: data.checklist_pos as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] });
      toast.success("Evento criado!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar evento"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_eventos")
        .update({
          nome: data.nome,
          data_inicio: data.data_inicio,
          data_fim: data.data_fim || null,
          local: data.local || null,
          objetivo: data.objetivo || null,
          tipo_evento: data.tipo_evento || null,
          status: data.status,
          checklist_pre: data.checklist_pre as unknown as Json,
          checklist_durante: data.checklist_durante as unknown as Json,
          checklist_pos: data.checklist_pos as unknown as Json,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] });
      toast.success("Evento atualizado!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar evento"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_eventos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] });
      toast.success("Evento excluído!");
    },
    onError: () => toast.error("Erro ao excluir evento"),
  });

  const resetForm = () => {
    setFormData({
      nome: "",
      data_inicio: "",
      data_fim: "",
      local: "",
      objetivo: "",
      tipo_evento: "",
      status: "planejando",
      checklist_pre: [],
      checklist_durante: [],
      checklist_pos: [],
    });
    setNewChecklistItem("");
  };

  const handleEdit = (item: Evento) => {
    setEditingItem(item);
    setFormData({
      nome: item.nome,
      data_inicio: item.data_inicio.slice(0, 16),
      data_fim: item.data_fim?.slice(0, 16) || "",
      local: item.local || "",
      objetivo: item.objetivo || "",
      tipo_evento: item.tipo_evento || "",
      status: item.status,
      checklist_pre: item.checklist_pre || [],
      checklist_durante: item.checklist_durante || [],
      checklist_pos: item.checklist_pos || [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nome || !formData.data_inicio) {
      toast.error("Informe nome e data do evento");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const addChecklistItem = (fase: "pre" | "durante" | "pos") => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      texto: newChecklistItem,
      concluido: false,
    };
    const key = `checklist_${fase}` as keyof typeof formData;
    setFormData({
      ...formData,
      [key]: [...(formData[key] as ChecklistItem[]), newItem],
    });
    setNewChecklistItem("");
  };

  const toggleChecklistItem = (fase: "pre" | "durante" | "pos", itemId: string) => {
    const key = `checklist_${fase}` as keyof typeof formData;
    const list = formData[key] as ChecklistItem[];
    setFormData({
      ...formData,
      [key]: list.map((item) =>
        item.id === itemId ? { ...item, concluido: !item.concluido } : item
      ),
    });
  };

  const removeChecklistItem = (fase: "pre" | "durante" | "pos", itemId: string) => {
    const key = `checklist_${fase}` as keyof typeof formData;
    const list = formData[key] as ChecklistItem[];
    setFormData({
      ...formData,
      [key]: list.filter((item) => item.id !== itemId),
    });
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getChecklistProgress = (checklist: ChecklistItem[] | null) => {
    if (!checklist || checklist.length === 0) return { done: 0, total: 0 };
    const done = checklist.filter((item) => item.concluido).length;
    return { done, total: checklist.length };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Eventos</h2>
          <p className="text-sm text-muted-foreground">Gerencie eventos de marketing</p>
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
              <Plus className="h-4 w-4" /> Novo Evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Evento" : "Novo Evento"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  placeholder="Nome do evento"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data/Hora Início *</Label>
                  <Input
                    type="datetime-local"
                    value={formData.data_inicio}
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data/Hora Fim</Label>
                  <Input
                    type="datetime-local"
                    value={formData.data_fim}
                    onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Local</Label>
                  <Input
                    placeholder="Local do evento"
                    value={formData.local}
                    onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Evento</Label>
                  <Input
                    placeholder="Ex: Feira, Workshop, Congresso"
                    value={formData.tipo_evento}
                    onChange={(e) => setFormData({ ...formData, tipo_evento: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Textarea
                  placeholder="Objetivo do evento..."
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
                />
              </div>

              {/* Checklists */}
              <div className="space-y-2">
                <Label>Checklists</Label>
                <Tabs value={activeChecklistTab} onValueChange={setActiveChecklistTab}>
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="pre">Pré-evento</TabsTrigger>
                    <TabsTrigger value="durante">Durante</TabsTrigger>
                    <TabsTrigger value="pos">Pós-evento</TabsTrigger>
                  </TabsList>
                  {(["pre", "durante", "pos"] as const).map((fase) => (
                    <TabsContent key={fase} value={fase} className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Nova tarefa..."
                          value={newChecklistItem}
                          onChange={(e) => setNewChecklistItem(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && addChecklistItem(fase)}
                        />
                        <Button type="button" onClick={() => addChecklistItem(fase)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {(formData[`checklist_${fase}`] as ChecklistItem[]).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 p-2 bg-muted rounded">
                            <Checkbox
                              checked={item.concluido}
                              onCheckedChange={() => toggleChecklistItem(fase, item.id)}
                            />
                            <span className={item.concluido ? "line-through text-muted-foreground" : ""}>
                              {item.texto}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 ml-auto"
                              onClick={() => removeChecklistItem(fase, item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
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

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar eventos..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px]">
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

      {/* Events List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum evento encontrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.planejando;
            const preProg = getChecklistProgress(item.checklist_pre);
            const duranteProg = getChecklistProgress(item.checklist_durante);
            const posProg = getChecklistProgress(item.checklist_pos);

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">{item.nome}</CardTitle>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                  {item.tipo_evento && (
                    <p className="text-xs text-muted-foreground">{item.tipo_evento}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(item.data_inicio), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  </div>
                  {item.local && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{item.local}</span>
                    </div>
                  )}
                  {/* Checklist Progress */}
                  <div className="flex gap-2 text-xs">
                    {preProg.total > 0 && (
                      <span className="flex items-center gap-1">
                        <CheckSquare className="h-3 w-3" /> Pré: {preProg.done}/{preProg.total}
                      </span>
                    )}
                    {duranteProg.total > 0 && (
                      <span className="flex items-center gap-1">
                        Durante: {duranteProg.done}/{duranteProg.total}
                      </span>
                    )}
                    {posProg.total > 0 && (
                      <span className="flex items-center gap-1">
                        Pós: {posProg.done}/{posProg.total}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Excluir este evento?")) {
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
