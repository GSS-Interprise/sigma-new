import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, MapPin, Calendar, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_CONFIG = {
  planejando: { label: "Planejando", variant: "secondary" as const },
  executando: { label: "Executando", variant: "default" as const },
  finalizado: { label: "Finalizado", variant: "outline" as const },
};

const defaultForm = { nome: "", data_inicio: "", local: "", objetivo: "", status: "planejando" };

export function EventosSimplificadoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["marketing-eventos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_eventos").select("*").order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_eventos").insert({
        nome: data.nome, data_inicio: data.data_inicio, local: data.local || null, objetivo: data.objetivo || null, status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] }); toast.success("Evento criado!"); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("marketing_eventos").update({
        nome: data.nome, data_inicio: data.data_inicio, local: data.local || null, objetivo: data.objetivo || null, status: data.status,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] }); toast.success("Evento atualizado!"); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("marketing_eventos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-eventos"] }); toast.success("Evento excluído!"); },
  });

  const resetForm = () => { setFormData(defaultForm); setEditingId(null); setIsDialogOpen(false); };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ nome: item.nome, data_inicio: item.data_inicio, local: item.local || "", objetivo: item.objetivo || "", status: item.status });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.nome || !formData.data_inicio) { toast.error("Preencha nome e data"); return; }
    editingId ? updateMutation.mutate({ id: editingId, data: formData }) : createMutation.mutate(formData);
  };

  const filteredItems = items?.filter((item) => {
    const matchSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-semibold">Eventos</h2><p className="text-sm text-muted-foreground">Gerencie eventos de marketing</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}><Plus className="h-4 w-4 mr-2" />Novo Evento</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? "Editar Evento" : "Novo Evento"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Nome *</Label><Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} placeholder="Nome do evento" /></div>
                <div className="space-y-2"><Label>Data *</Label><Input type="date" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Local</Label><Input value={formData.local} onChange={(e) => setFormData({ ...formData, local: e.target.value })} placeholder="Local do evento" /></div>
                <div className="space-y-2"><Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_CONFIG).map(([key, { label }]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Objetivo</Label><Input value={formData.objetivo} onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })} placeholder="Objetivo do evento" /></div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Salvar Alterações" : "Criar Evento"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar evento..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS_CONFIG).map(([key, { label }]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent></Select>
      </div>

      {isLoading ? (<div className="text-center py-8 text-muted-foreground">Carregando...</div>) : filteredItems?.length === 0 ? (<div className="text-center py-8 text-muted-foreground">Nenhum evento encontrado</div>) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems?.map((item) => (
            <Card key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <h3 className="font-medium">{item.nome}</h3>
                <Badge variant={STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.variant || "secondary"}>{STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.label || item.status}</Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(item.data_inicio), "dd/MM/yyyy", { locale: ptBR })}</div>
                {item.local && <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.local}</div>}
              </div>
              {item.objetivo && <p className="text-sm">{item.objetivo}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(item)}><Edit className="h-3 w-3 mr-1" />Editar</Button>
                <Button variant="destructive" size="sm" onClick={() => { if (confirm("Excluir?")) deleteMutation.mutate(item.id); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
