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
import { Plus, Search, Target, Users, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  planejamento: { label: "Planejamento", variant: "secondary" as const },
  em_execucao: { label: "Em Execução", variant: "default" as const },
  finalizado: { label: "Finalizado", variant: "outline" as const },
};

const defaultForm = { objetivo: "", publico: "", status: "planejamento", relatorio_final: "" };

export function PlanejamentoSimplificadoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["marketing-planejamentos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_planejamentos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_planejamentos").insert({
        objetivo: data.objetivo, publico: data.publico || null, status: data.status, relatorio_final: data.relatorio_final || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] }); toast.success("Planejamento criado!"); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("marketing_planejamentos").update({
        objetivo: data.objetivo, publico: data.publico || null, status: data.status, relatorio_final: data.relatorio_final || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] }); toast.success("Planejamento atualizado!"); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("marketing_planejamentos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-planejamentos"] }); toast.success("Planejamento excluído!"); },
  });

  const resetForm = () => { setFormData(defaultForm); setEditingId(null); setIsDialogOpen(false); };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ objetivo: item.objetivo, publico: item.publico || "", status: item.status, relatorio_final: item.relatorio_final || "" });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => { if (!formData.objetivo) { toast.error("Preencha o objetivo"); return; } editingId ? updateMutation.mutate({ id: editingId, data: formData }) : createMutation.mutate(formData); };

  const filteredItems = items?.filter((item) => {
    const matchSearch = item.objetivo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || item.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-semibold">Planejamento de Campanhas</h2><p className="text-sm text-muted-foreground">Planeje suas campanhas de marketing</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}><Plus className="h-4 w-4 mr-2" />Novo Planejamento</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} Planejamento</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Objetivo *</Label><Input value={formData.objetivo} onChange={(e) => setFormData({ ...formData, objetivo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Público</Label><Input value={formData.publico} onChange={(e) => setFormData({ ...formData, publico: e.target.value })} /></div>
              <div className="space-y-2"><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select></div>
              {formData.status === "finalizado" && <div className="space-y-2"><Label>Resultados</Label><Textarea value={formData.relatorio_final} onChange={(e) => setFormData({ ...formData, relatorio_final: e.target.value })} rows={3} /></div>}
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Salvar" : "Criar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /></div>
        <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(STATUS_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select>
      </div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredItems?.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhum planejamento</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems?.map((item) => (
            <Card key={item.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /><h3 className="font-medium">{item.objetivo}</h3></div>
                <Badge variant={STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.variant || "secondary"}>{STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG]?.label || item.status}</Badge>
              </div>
              {item.publico && <div className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-3 w-3" />{item.publico}</div>}
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
