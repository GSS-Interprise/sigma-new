import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Lightbulb, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

const defaultForm = { titulo: "", descricao: "", categoria: "ideia" };

export function BancoIdeiasSimplificadoTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["marketing-ideias"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_ideias").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("marketing_ideias").insert({ titulo: data.titulo, descricao: data.descricao || null, categoria: data.categoria });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] }); toast.success("Ideia adicionada!"); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("marketing_ideias").update({ titulo: data.titulo, descricao: data.descricao || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] }); toast.success("Ideia atualizada!"); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("marketing_ideias").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["marketing-ideias"] }); toast.success("Ideia excluída!"); },
  });

  const resetForm = () => { setFormData(defaultForm); setEditingId(null); setIsDialogOpen(false); };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ titulo: item.titulo, descricao: item.descricao || "", categoria: item.categoria || "ideia" });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => { if (!formData.titulo) { toast.error("Preencha o título"); return; } editingId ? updateMutation.mutate({ id: editingId, data: formData }) : createMutation.mutate(formData); };

  const filteredItems = items?.filter((item) => item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || item.descricao?.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-semibold">Banco de Ideias</h2><p className="text-sm text-muted-foreground">Mural de ideias e inspirações</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}><Plus className="h-4 w-4 mr-2" />Nova Ideia</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Ideia" : "Nova Ideia"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Título *</Label><Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} placeholder="Ideia de post, tema..." /></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} placeholder="Descreva a ideia..." rows={4} /></div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Salvar" : "Adicionar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar ideias..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /></div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredItems?.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhuma ideia</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems?.map((item) => (
            <Card key={item.id} className="p-4 space-y-3 bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200/50">
              <div className="flex items-start gap-2"><Lightbulb className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" /><h3 className="font-medium">{item.titulo}</h3></div>
              {item.descricao && <p className="text-sm text-muted-foreground line-clamp-3">{item.descricao}</p>}
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
