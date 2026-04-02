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
import { Plus, Search, Lightbulb, ArrowRight, Edit, Trash2, ExternalLink, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  pendente: { label: "Pendente", variant: "secondary" as const },
  analisada: { label: "Analisada", variant: "outline" as const },
  convertida: { label: "Convertida", variant: "default" as const },
  descartada: { label: "Descartada", variant: "destructive" as const },
};

const CATEGORIA_CONFIG = {
  post: { label: "Post" },
  evento: { label: "Evento" },
  campanha: { label: "Campanha" },
  endomarketing: { label: "Endomarketing" },
  trafego: { label: "Tráfego Pago" },
  outro: { label: "Outro" },
};

interface Ideia {
  id: string;
  titulo: string;
  categoria: string;
  descricao: string | null;
  referencia_url: string | null;
  referencia_imagem: string | null;
  status: string;
  convertido_para_tipo: string | null;
  created_at: string;
}

export function IdeiasTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Ideia | null>(null);
  
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    titulo: "",
    categoria: "post",
    descricao: "",
    referencia_url: "",
    referencia_imagem: "",
    status: "pendente",
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-ideias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_ideias")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Ideia[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_ideias").insert({
        titulo: data.titulo,
        categoria: data.categoria,
        descricao: data.descricao || null,
        referencia_url: data.referencia_url || null,
        referencia_imagem: data.referencia_imagem || null,
        status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] });
      toast.success("Ideia registrada!");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao registrar ideia"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("marketing_ideias")
        .update({
          titulo: data.titulo,
          categoria: data.categoria,
          descricao: data.descricao || null,
          referencia_url: data.referencia_url || null,
          referencia_imagem: data.referencia_imagem || null,
          status: data.status,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] });
      toast.success("Ideia atualizada!");
      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: () => toast.error("Erro ao atualizar ideia"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_ideias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] });
      toast.success("Ideia excluída!");
    },
    onError: () => toast.error("Erro ao excluir ideia"),
  });

  const convertMutation = useMutation({
    mutationFn: async ({ id, tipo }: { id: string; tipo: string }) => {
      const { error } = await supabase
        .from("marketing_ideias")
        .update({
          status: "convertida",
          convertido_para_tipo: tipo,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] });
      toast.success("Ideia convertida! Crie o item no módulo correspondente.");
    },
    onError: () => toast.error("Erro ao converter ideia"),
  });

  const resetForm = () => {
    setFormData({
      titulo: "",
      categoria: "post",
      descricao: "",
      referencia_url: "",
      referencia_imagem: "",
      status: "pendente",
    });
  };

  const handleEdit = (item: Ideia) => {
    setEditingItem(item);
    setFormData({
      titulo: item.titulo,
      categoria: item.categoria,
      descricao: item.descricao || "",
      referencia_url: item.referencia_url || "",
      referencia_imagem: item.referencia_imagem || "",
      status: item.status,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.titulo) {
      toast.error("Informe o título da ideia");
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    const matchesCategoria = filterCategoria === "all" || item.categoria === filterCategoria;
    return matchesSearch && matchesStatus && matchesCategoria;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Banco de Ideias</h2>
          <p className="text-sm text-muted-foreground">Registre e gerencie ideias para ações de marketing</p>
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
              <Plus className="h-4 w-4" /> Nova Ideia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Ideia" : "Nova Ideia"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  placeholder="Título da ideia"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={formData.categoria} onValueChange={(v) => setFormData({ ...formData, categoria: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  placeholder="Descreva a ideia..."
                  rows={3}
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>URL de Referência</Label>
                <Input
                  placeholder="https://..."
                  value={formData.referencia_url}
                  onChange={(e) => setFormData({ ...formData, referencia_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Imagem de Referência (URL)</Label>
                <Input
                  placeholder="https://..."
                  value={formData.referencia_imagem}
                  onChange={(e) => setFormData({ ...formData, referencia_imagem: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit}>
                {editingItem ? "Salvar" : "Registrar"}
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
            placeholder="Buscar ideias..."
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
        <Select value={filterCategoria} onValueChange={setFilterCategoria}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ideas List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma ideia encontrada
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pendente;
            const categoriaConfig = CATEGORIA_CONFIG[item.categoria as keyof typeof CATEGORIA_CONFIG] || CATEGORIA_CONFIG.outro;

            return (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <CardTitle className="text-sm font-medium">{item.titulo}</CardTitle>
                    </div>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{categoriaConfig.label}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.descricao && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{item.descricao}</p>
                  )}
                  {item.referencia_imagem && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      <span className="truncate">Imagem anexada</span>
                    </div>
                  )}
                  {item.referencia_url && (
                    <a
                      href={item.referencia_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver referência
                    </a>
                  )}
                  {item.convertido_para_tipo && (
                    <p className="text-xs text-green-600">
                      Convertida para: {CATEGORIA_CONFIG[item.convertido_para_tipo as keyof typeof CATEGORIA_CONFIG]?.label || item.convertido_para_tipo}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(item.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex justify-between items-center pt-2 border-t">
                    {item.status !== "convertida" && item.status !== "descartada" && (
                      <Select onValueChange={(tipo) => convertMutation.mutate({ id: item.id, tipo })}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue placeholder="Converter em..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CATEGORIA_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" /> {cfg.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Excluir esta ideia?")) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
