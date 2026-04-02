import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Calendar, Edit, Trash2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { parseLocalDate } from "@/lib/dateUtils";

// Configuração das colunas do Kanban estilo Trello
const KANBAN_COLUMNS = {
  a_fazer: { 
    label: "BACKLOG", 
    bgColor: "bg-slate-100 dark:bg-slate-800/50",
    headerColor: "bg-slate-200 dark:bg-slate-700"
  },
  em_producao: { 
    label: "ROTEIRIZAR/ESCREVER", 
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    headerColor: "bg-amber-200 dark:bg-amber-800/50"
  },
  em_revisao: { 
    label: "DESIGN/PRODUÇÃO", 
    bgColor: "bg-violet-50 dark:bg-violet-900/20",
    headerColor: "bg-violet-200 dark:bg-violet-800/50"
  },
  aprovado: { 
    label: "AGUARDANDO APROVAÇÃO", 
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    headerColor: "bg-orange-200 dark:bg-orange-800/50"
  },
  agendado: { 
    label: "AGENDADO", 
    bgColor: "bg-cyan-50 dark:bg-cyan-900/20",
    headerColor: "bg-cyan-200 dark:bg-cyan-800/50"
  },
  publicado: { 
    label: "POSTADO", 
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    headerColor: "bg-emerald-200 dark:bg-emerald-800/50"
  },
};

const TIPO_CONFIG = {
  post: "Post",
  reels: "Reels",
  story: "Story",
  video: "Vídeo",
  carousel: "Carrossel",
};

const defaultForm = {
  conta_perfil: "",
  objetivo: "",
  tipo: "post",
  legenda: "",
  status: "a_fazer",
  data_publicacao: "",
};

interface ConteudoItem {
  id: string;
  conta_perfil: string | null;
  objetivo: string | null;
  tipo: string;
  legenda: string | null;
  status: string;
  data_publicacao: string | null;
  created_at: string;
}

export function MarketingDigitalTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [draggedItem, setDraggedItem] = useState<ConteudoItem | null>(null);
  const [novaConta, setNovaConta] = useState("");
  const [isCreatingConta, setIsCreatingConta] = useState(false);
  const queryClient = useQueryClient();

  // Query para buscar contas de marketing
  const { data: contas = [] } = useQuery({
    queryKey: ["marketing-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contas")
        .select("*")
        .order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  // Mutation para criar nova conta
  const createContaMutation = useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from("marketing_contas")
        .insert({ nome })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contas"] });
      setFormData({ ...formData, conta_perfil: data.nome });
      setNovaConta("");
      setIsCreatingConta(false);
      toast.success("Conta adicionada!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar conta");
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["marketing-conteudos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_conteudos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ConteudoItem[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_conteudos").insert({
        conta_perfil: data.conta_perfil || null,
        objetivo: data.objetivo || null,
        tipo: data.tipo,
        legenda: data.legenda || null,
        status: data.status,
        data_publicacao: data.data_publicacao || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-conteudos"] });
      toast.success("Conteúdo criado!");
      resetForm();
    },
    onError: (error: any) => {
      console.error("Erro ao criar conteúdo:", error);
      toast.error(error.message || "Erro ao criar conteúdo");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from("marketing_conteudos")
        .update({
          conta_perfil: data.conta_perfil || null,
          objetivo: data.objetivo || null,
          tipo: data.tipo,
          legenda: data.legenda || null,
          status: data.status,
          data_publicacao: data.data_publicacao || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-conteudos"] });
      toast.success("Conteúdo atualizado!");
      resetForm();
    },
    onError: (error: any) => {
      console.error("Erro ao atualizar conteúdo:", error);
      toast.error(error.message || "Erro ao atualizar conteúdo");
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("marketing_conteudos")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-conteudos"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_conteudos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-conteudos"] });
      toast.success("Conteúdo excluído!");
    },
  });

  const resetForm = () => {
    setFormData(defaultForm);
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (item: ConteudoItem) => {
    setEditingId(item.id);
    setFormData({
      conta_perfil: item.conta_perfil || "",
      objetivo: item.objetivo || "",
      tipo: item.tipo,
      legenda: item.legenda || "",
      status: item.status,
      data_publicacao: item.data_publicacao || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.objetivo?.trim()) {
      toast.error("Informe o objetivo/título do post");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDragStart = (e: React.DragEvent, item: ConteudoItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem.status !== status) {
      moveMutation.mutate({ id: draggedItem.id, status });
    }
    setDraggedItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const openNewCardDialog = (status: string) => {
    setEditingId(null);
    setFormData({ ...defaultForm, status });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Calendário de Posts</h2>
          <p className="text-sm text-muted-foreground">Acompanhe o fluxo de criação de conteúdo</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Card
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Card" : "Novo Card"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Título/Objetivo *</Label>
                <Input
                  value={formData.objetivo}
                  onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })}
                  placeholder="Ex: Janeiro Branco - Saúde mental"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Conta/Perfil</Label>
                  {isCreatingConta ? (
                    <div className="flex gap-2">
                      <Input
                        value={novaConta}
                        onChange={(e) => setNovaConta(e.target.value)}
                        placeholder="Ex: @instagram"
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        size="sm"
                        onClick={() => {
                          if (novaConta.trim()) {
                            createContaMutation.mutate(novaConta.trim());
                          }
                        }}
                        disabled={createContaMutation.isPending}
                      >
                        Salvar
                      </Button>
                      <Button 
                        type="button" 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setIsCreatingConta(false); setNovaConta(""); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Select 
                      value={formData.conta_perfil} 
                      onValueChange={(v) => {
                        if (v === "__nova__") {
                          setIsCreatingConta(true);
                        } else {
                          setFormData({ ...formData, conta_perfil: v });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {contas.map((conta) => (
                          <SelectItem key={conta.id} value={conta.nome}>{conta.nome}</SelectItem>
                        ))}
                        <SelectItem value="__nova__" className="text-primary font-medium">
                          <span className="flex items-center gap-1">
                            <Plus className="h-3 w-3" /> Criar nova conta
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_CONFIG).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Legenda</Label>
                <Textarea
                  value={formData.legenda}
                  onChange={(e) => setFormData({ ...formData, legenda: e.target.value })}
                  placeholder="Texto da legenda..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Coluna</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(KANBAN_COLUMNS).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data Publicação</Label>
                  <Input
                    type="date"
                    value={formData.data_publicacao}
                    onChange={(e) => setFormData({ ...formData, data_publicacao: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingId ? "Salvar Alterações" : "Criar Card"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {Object.entries(KANBAN_COLUMNS).map(([columnKey, columnConfig]) => {
            const columnItems = items.filter((item) => item.status === columnKey);

            return (
              <div
                key={columnKey}
                className={`w-[280px] rounded-lg ${columnConfig.bgColor} flex flex-col h-[600px]`}
                onDrop={(e) => handleDrop(e, columnKey)}
                onDragOver={handleDragOver}
              >
                {/* Column Header */}
                <div className={`px-3 py-2 ${columnConfig.headerColor} rounded-t-lg`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{columnConfig.label}</h3>
                    <span className="text-xs text-muted-foreground bg-background/80 rounded-full px-2 py-0.5">
                      {columnItems.length}
                    </span>
                  </div>
                </div>

                {/* Column Content */}
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {columnItems.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow bg-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                      >
                        <CardContent className="p-3 space-y-2">
                          {/* Tags */}
                          <div className="flex gap-1">
                            <Badge variant="secondary" className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-300">
                              {TIPO_CONFIG[item.tipo as keyof typeof TIPO_CONFIG] || item.tipo}
                            </Badge>
                            {item.conta_perfil && (
                              <Badge variant="outline" className="text-xs">
                                {item.conta_perfil}
                              </Badge>
                            )}
                          </div>

                          {/* Title */}
                          <p className="font-medium text-sm leading-snug">
                            {item.objetivo || "Sem título"}
                          </p>

                          {/* Meta info */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            {item.data_publicacao && parseLocalDate(item.data_publicacao) && (
                              <span className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                                <Calendar className="h-3 w-3" />
                                {format(parseLocalDate(item.data_publicacao)!, "d 'de' MMM", { locale: ptBR })}
                              </span>
                            )}
                            {item.legenda && (
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 pt-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(item)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm("Excluir este card?")) deleteMutation.mutate(item.id); }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>

                {/* Add Card Button */}
                <div className="p-2 border-t border-border/50">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-muted-foreground hover:text-foreground"
                    onClick={() => openNewCardDialog(columnKey)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar um cartão
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}