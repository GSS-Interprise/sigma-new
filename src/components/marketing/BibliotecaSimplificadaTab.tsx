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
import { Plus, Search, FileText, Image, Folder, Download, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

const CATEGORIA_CONFIG: Record<string, { label: string; icon: any }> = {
  pdf: { label: "PDF", icon: FileText },
  apresentacao: { label: "Apresentação", icon: FileText },
  modelo_mensagem: { label: "Modelo", icon: FileText },
  logo: { label: "Logo", icon: Image },
  template: { label: "Template", icon: FileText },
  politica_interna: { label: "Política", icon: FileText },
};

const defaultForm = { nome: "", arquivo_nome: "", categoria: "pdf" as const, pasta: "", descricao: "", arquivo_url: "" };

export function BibliotecaSimplificadaTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["biblioteca-arquivos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("materiais_biblioteca").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("materiais_biblioteca").insert([{
        nome: data.nome, arquivo_nome: data.arquivo_nome || data.nome, arquivo_url: data.arquivo_url || "", categoria: data.categoria, pasta: data.pasta || null, descricao: data.descricao || null,
      }]);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["biblioteca-arquivos"] }); toast.success("Arquivo adicionado!"); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase.from("materiais_biblioteca").update({
        nome: data.nome, arquivo_nome: data.arquivo_nome || data.nome, arquivo_url: data.arquivo_url || "", categoria: data.categoria, pasta: data.pasta || null, descricao: data.descricao || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["biblioteca-arquivos"] }); toast.success("Arquivo atualizado!"); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("materiais_biblioteca").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["biblioteca-arquivos"] }); toast.success("Arquivo excluído!"); },
  });

  const resetForm = () => { setFormData(defaultForm); setEditingId(null); setIsDialogOpen(false); };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData({ nome: item.nome, arquivo_nome: item.arquivo_nome, categoria: item.categoria, pasta: item.pasta || "", descricao: item.descricao || "", arquivo_url: item.arquivo_url || "" });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => { if (!formData.nome) { toast.error("Preencha o nome"); return; } editingId ? updateMutation.mutate({ id: editingId, data: formData }) : createMutation.mutate(formData); };

  const filteredItems = items?.filter((item) => {
    const matchSearch = item.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filterCategoria === "all" || item.categoria === filterCategoria;
    return matchSearch && matchCategoria;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div><h2 className="text-xl font-semibold">Biblioteca de Arquivos</h2><p className="text-sm text-muted-foreground">Organize fotos, vídeos, logos e documentos</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setFormData(defaultForm); }}><Plus className="h-4 w-4 mr-2" />Novo Arquivo</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? "Editar Arquivo" : "Novo Arquivo"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Nome *</Label><Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value, arquivo_nome: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Categoria</Label><Select value={formData.categoria} onValueChange={(v: any) => setFormData({ ...formData, categoria: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CATEGORIA_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Pasta</Label><Input value={formData.pasta} onChange={(e) => setFormData({ ...formData, pasta: e.target.value })} placeholder="Ex: Campanhas" /></div>
              </div>
              <div className="space-y-2"><Label>URL do Arquivo</Label><Input value={formData.arquivo_url} onChange={(e) => setFormData({ ...formData, arquivo_url: e.target.value })} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={2} /></div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? "Salvar" : "Adicionar"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" /></div>
        <Select value={filterCategoria} onValueChange={setFilterCategoria}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{Object.entries(CATEGORIA_CONFIG).map(([k, { label }]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}</SelectContent></Select>
      </div>

      {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : filteredItems?.length === 0 ? <div className="text-center py-8 text-muted-foreground">Nenhum arquivo</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems?.map((item) => {
            const Icon = CATEGORIA_CONFIG[item.categoria]?.icon || FileText;
            return (
              <Card key={item.id} className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg"><Icon className="h-5 w-5 text-primary" /></div>
                  <div className="flex-1 min-w-0"><h3 className="font-medium truncate">{item.nome}</h3><Badge variant="outline" className="mt-1 text-xs">{CATEGORIA_CONFIG[item.categoria]?.label || item.categoria}</Badge></div>
                </div>
                {item.pasta && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Folder className="h-3 w-3" />{item.pasta}</div>}
                {item.descricao && <p className="text-sm text-muted-foreground line-clamp-2">{item.descricao}</p>}
                <div className="flex gap-2">
                  {item.arquivo_url && <Button variant="outline" size="sm" className="flex-1" asChild><a href={item.arquivo_url} target="_blank" rel="noopener noreferrer"><Download className="h-3 w-3 mr-1" />Baixar</a></Button>}
                  <Button variant="outline" size="sm" onClick={() => handleEdit(item)}><Edit className="h-3 w-3" /></Button>
                  <Button variant="destructive" size="sm" onClick={() => { if (confirm("Excluir?")) deleteMutation.mutate(item.id); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
