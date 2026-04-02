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
import { Plus, Search, Users, Calendar, Edit, Trash2, Send } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  em_criacao: { label: "Em Criação", variant: "secondary" as const },
  aprovado: { label: "Aprovado", variant: "default" as const },
  enviado: { label: "Enviado", variant: "outline" as const },
};

interface Endomarketing {
  id: string;
  nome: string;
  publico_interno: string[] | null;
  objetivo: string | null;
  status: string;
  data_envio: string | null;
  created_at: string;
}

export function EndomarketingTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Endomarketing | null>(null);
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nome: "",
    publico_interno: "",
    objetivo: "",
    status: "em_criacao",
    data_envio: "",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-endomarketing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_endomarketing")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Endomarketing[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_endomarketing").insert({
        nome: data.nome,
        publico_interno: data.publico_interno ? data.publico_interno.split(",").map(s => s.trim()) : null,
        objetivo: data.objetivo || null,
        status: data.status,
        data_envio: data.data_envio || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-endomarketing"] });
      toast.success("Ação de endomarketing criada!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar ação"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_endomarketing")
        .update({
          nome: data.nome,
          publico_interno: data.publico_interno ? data.publico_interno.split(",").map(s => s.trim()) : null,
          objetivo: data.objetivo || null,
          status: data.status,
          data_envio: data.data_envio || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-endomarketing"] });
      toast.success("Ação atualizada!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar ação"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_endomarketing").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-endomarketing"] });
      toast.success("Ação excluída!");
    },
    onError: () => toast.error("Erro ao excluir ação"),
  });

  const resetForm = () => {
    setFormData({
      nome: "",
      publico_interno: "",
      objetivo: "",
      status: "em_criacao",
      data_envio: "",
    });
  };

  const handleEdit = (item: Endomarketing) => {
    setEditingItem(item);
    setFormData({
      nome: item.nome,
      publico_interno: item.publico_interno?.join(", ") || "",
      objetivo: item.objetivo || "",
      status: item.status,
      data_envio: item.data_envio?.split("T")[0] || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nome) {
      toast.error("Informe o nome da ação");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Endomarketing</h2>
          <p className="text-sm text-muted-foreground">Gerencie ações de comunicação interna</p>
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
              <Plus className="h-4 w-4" /> Nova Ação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Ação" : "Nova Ação de Endomarketing"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  placeholder="Nome da ação"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                />
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
                <div className="space-y-2">
                  <Label>Data de Envio</Label>
                  <Input
                    type="date"
                    value={formData.data_envio}
                    onChange={(e) => setFormData({ ...formData, data_envio: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Público Interno (separado por vírgula)</Label>
                <Input
                  placeholder="Ex: TI, RH, Comercial"
                  value={formData.publico_interno}
                  onChange={(e) => setFormData({ ...formData, publico_interno: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Textarea
                  placeholder="Descreva o objetivo da ação..."
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ações..."
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

      {/* Actions List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma ação encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.em_criacao;

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-medium">{item.nome}</CardTitle>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.objetivo && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{item.objetivo}</p>
                  )}
                  {item.publico_interno && item.publico_interno.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{item.publico_interno.join(", ")}</span>
                    </div>
                  )}
                  {item.data_envio && (
                    <div className="flex items-center gap-2 text-sm">
                      <Send className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(new Date(item.data_envio), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Excluir esta ação?")) {
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
